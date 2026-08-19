import { createRequire } from 'node:module'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, isAbsolute, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { defineTool, type ParameterSchemaSpec, type PreToolDecision } from '@deepseek-ai/dsh-tools'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { deleteOwnedAuthorization } from './auth-files.ts'
import { createAuthRemoteApi, type AuthRemoteController } from './auth-remote.ts'
import { createCliAuthBackend } from './cli-auth-backend.ts'
import type { DynamicToolDefinition } from './catalog.ts'
import { createWeComHost } from './host.ts'
import { createRuntimeTool, type RuntimeTool } from './tool-adapter.ts'
import { createGenerationInstaller } from './generation-installer.ts'
import { createNodeProcessExecutor, createWeComProcessRunner, type JsonValue } from './transport.ts'
import { waitForFile } from './qr-file.ts'
import type { WeComAuthSnapshot } from './remote-types.ts'

export interface Config {
  readonly configDir?: string
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
}

export const Config: z<Config> = z.object({
  configDir: z.string().default('.dsh/wecom'),
  timeoutMs: z.number().step(1).min(1_000).default(300_000),
  maxOutputBytes: z.number().step(1).min(1_024).default(1_048_576),
})

export const name = 'wecom'
export const inject = ['tools']

export class WeComAuthRemote extends TypertRemoteService {
  private readonly api

  constructor(ctx: Context, controller: AuthRemoteController) {
    super(ctx, 'wecomAuth')
    this.api = createAuthRemoteApi(controller)
  }

  @Remote('status') status(): WeComAuthSnapshot { return this.api.status() }
  @Remote('connect') connect(): WeComAuthSnapshot { return this.api.connect() }
  @Remote('cancel') cancel(): WeComAuthSnapshot { return this.api.cancel() }
  @Remote('refresh') refresh(): Promise<WeComAuthSnapshot> { return this.api.refresh() }
  @Remote('deleteAuthorization') deleteAuthorization(confirmed: boolean): Promise<WeComAuthSnapshot> { return this.api.deleteAuthorization(confirmed) }
}

function cliExecutable(): string {
  const require = createRequire(import.meta.url)
  return resolve(dirname(require.resolve('@wecom/cli/package.json')), 'bin/wecom.js')
}

function profilePath(value: string): string {
  const path = isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value)
  if (path === resolve(path, '/')) throw new Error('unsafe WeCom configuration directory')
  return path
}

/** Standard Cordis Host entry. Dynamic tools exist only while authorization is valid. */
export function apply(ctx: Context, config: Config): void {
  const configDir = profilePath(config.configDir ?? '.dsh/wecom')
  const tempDir = resolve(configDir, 'tmp')
  const execute = createNodeProcessExecutor()
  const executable = cliExecutable()
  void mkdir(tempDir, { recursive: true })

  const runner = createWeComProcessRunner({
    executable, configDir, tempDir, execute,
    timeoutMs: config.timeoutMs ?? 300_000,
    maxOutputBytes: config.maxOutputBytes ?? 1_048_576,
  })
  const runtimeTools = new Map<string, RuntimeTool>()
  const installTools = createGenerationInstaller<DynamicToolDefinition>({
    name: definition => definition.name,
    activate: definition => { runtimeTools.set(definition.name, createRuntimeTool(definition.method, runner)) },
    register: definition => {
      const dispose = ctx.tools.register(defineTool({
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters as ParameterSchemaSpec,
        output: {
          schema: { type: 'json' },
          render: (_args: unknown, value: JsonValue) => [{ type: 'text', text: JSON.stringify(value) }],
        },
        isConcurrencySafe: () => runtimeTools.get(definition.name)?.risk === 'read',
        execute: (args, execution) => {
          const runtime = runtimeTools.get(definition.name)
          if (runtime === undefined) throw new Error(`WeCom tool is unavailable: ${definition.name}`)
          return runtime.execute(args as JsonValue, execution.signal)
        },
      }))
      return () => { dispose(); runtimeTools.delete(definition.name) }
    },
  })
  const host = createWeComHost({
    runner,
    authBackend: createCliAuthBackend({
      executable, configDir, tempDir, execute,
      readQr: waitForFile,
      deleteOwned: () => deleteOwnedAuthorization(configDir, {
        removeFile: path => rm(path, { force: true }),
        removeTree: path => rm(path, { recursive: true, force: true }),
      }),
    }),
    installTools,
  })

  new WeComAuthRemote(ctx, host.auth)
  ctx.on('tools/pre-execute', async (execution, next): Promise<PreToolDecision> => {
    const runtime = runtimeTools.get(execution.name)
    if (runtime === undefined) return next()
    return runtime.preDecision(execution.arguments)
  })
  void host.initialize()
}

export type { WeComAuthSnapshot } from './remote-types.ts'
