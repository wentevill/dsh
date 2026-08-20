import { createRequire } from 'node:module'
import { arch, platform } from 'node:os'
import { mkdir, rm } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { defineTool, type ParameterSchemaSpec, type PreToolDecision } from '@deepseek-ai/dsh-tools'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import QRCode from 'qrcode'
import { deleteOwnedAuthorization } from './auth-files.ts'
import { createAuthRemoteApi, type AuthRemoteController } from './auth-remote.ts'
import { createCliAuthBackend } from './cli-auth-backend.ts'
import { createWeComChannelHost } from './channel-host.ts'
import type { DynamicToolDefinition } from './catalog.ts'
import { createWeComHost } from './host.ts'
import { createRuntimeTool, type RuntimeTool } from './tool-adapter.ts'
import { createGenerationInstaller } from './generation-installer.ts'
import { createNodeProcessExecutor, createWeComProcessRunner, type JsonValue } from './transport.ts'
import { waitForFile } from './qr-file.ts'
import { createQrAuthManager } from './qr-auth-manager.ts'
import {
  defaultSessionWorkspaceTemplate,
  sessionWorkspaceTemplateSchema,
} from './session-workspace.ts'
import type { WeComAuthSnapshot } from './remote-types.ts'

export interface Config {
  readonly configDir?: string
  readonly profile?: string
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
  readonly sessionWorkspaceTemplate?: string
}

export const Config: z<Config> = z.object({
  configDir: z.string(),
  profile: z.string().default('web'),
  timeoutMs: z.number().step(1).min(1_000).default(300_000),
  maxOutputBytes: z.number().step(1).min(1_024).default(1_048_576),
  sessionWorkspaceTemplate: sessionWorkspaceTemplateSchema,
})

export const name = 'wecom'
export const inject = [
  'tools', 'agents', 'sessions', 'credentials', 'storageDomain',
  'sessionPersistence', 'agentDefaultModel', 'attachments',
]
const WECOM_SETTINGS_NAMESPACE = settingsNamespace('wecom')

export class WeComAuthRemote extends TypertRemoteService {
  private readonly api

  constructor(
    ctx: Context,
    controller: AuthRemoteController,
    private readonly channelSnapshot: () => WeComAuthSnapshot['channel'],
  ) {
    super(ctx, 'wecomAuth')
    this.api = createAuthRemoteApi(controller)
  }

  private withChannel(snapshot: WeComAuthSnapshot): WeComAuthSnapshot {
    return { ...snapshot, channel: this.channelSnapshot() }
  }

  @Remote('status') status(): WeComAuthSnapshot { return this.withChannel(this.api.status()) }
  @Remote('connect') connect(): WeComAuthSnapshot { return this.withChannel(this.api.connect()) }
  @Remote('cancel') cancel(): WeComAuthSnapshot { return this.withChannel(this.api.cancel()) }
  @Remote('refresh') async refresh(): Promise<WeComAuthSnapshot> { return this.withChannel(await this.api.refresh()) }
  @Remote('deleteAuthorization') async deleteAuthorization(confirmed: boolean): Promise<WeComAuthSnapshot> {
    return this.withChannel(await this.api.deleteAuthorization(confirmed))
  }
}

function cliExecutable(): string {
  const require = createRequire(import.meta.url)
  const key = `${platform()}-${arch()}`
  const packages: Record<string, string> = {
    'darwin-arm64': '@wecom/cli-darwin-arm64', 'darwin-x64': '@wecom/cli-darwin-x64',
    'linux-arm64': '@wecom/cli-linux-arm64', 'linux-x64': '@wecom/cli-linux-x64',
    'win32-x64': '@wecom/cli-win32-x64',
  }
  const packageName = packages[key]
  if (packageName === undefined) throw new Error(`unsupported wecom-cli platform: ${key}`)
  const packagePath = require.resolve(`${packageName}/package.json`)
  return join(dirname(packagePath), 'bin', platform() === 'win32' ? 'wecom-cli.exe' : 'wecom-cli')
}

function profilePath(ctx: Context, config: Config): string {
  if (config.configDir !== undefined) {
    if (!isAbsolute(config.configDir)) throw new Error('WeCom configDir must be absolute')
    const path = resolve(config.configDir)
    if (path === resolve(path, '/')) throw new Error('unsafe WeCom configuration directory')
    return path
  }
  const profile = config.profile ?? 'web'
  if (!/^[a-zA-Z0-9_-]+$/u.test(profile)) throw new Error('invalid WeCom profile name')
  const resolver = (ctx as Context & { dshHomePath?: (...segments: string[]) => string }).dshHomePath
  if (resolver === undefined) throw new Error('WeCom requires an absolute configDir outside a profile launch')
  return resolver('profiles', profile, 'plugins', 'wecom')
}

/** Standard Cordis Host entry. Dynamic tools exist only while authorization is valid. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const configDir = profilePath(ctx, config)
  const sessionWorkspaceTemplate = config.sessionWorkspaceTemplate ?? defaultSessionWorkspaceTemplate()
  if (!isAbsolute(sessionWorkspaceTemplate)) {
    throw new Error('WeCom sessionWorkspaceTemplate must be absolute')
  }
  const tempDir = resolve(configDir, 'tmp')
  const execute = createNodeProcessExecutor()
  const executable = cliExecutable()
  await mkdir(tempDir, { recursive: true })

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
  const cliAuth = createCliAuthBackend({
    executable, configDir, tempDir, execute,
    readQr: waitForFile,
    deleteOwned: () => deleteOwnedAuthorization(configDir, {
      removeFile: path => rm(path, { force: true }),
      removeTree: path => rm(path, { recursive: true, force: true }),
    }),
  })
  const channelHost = await createWeComChannelHost(ctx, {
    cli: cliAuth,
    sessionWorkspaceTemplate,
    qr: createQrAuthManager({
      toQrDataUrl: value => QRCode.toDataURL(value, { width: 240, margin: 1 }),
    }),
  })
  ctx.effect(() => async () => { await channelHost.dispose() }, 'wecom.channelHost()')
  const host = createWeComHost({
    runner,
    authBackend: channelHost.authBackend,
    installTools,
  })

  new WeComAuthRemote(ctx, host.auth, channelHost.snapshot)
  ctx.inject(['settings'], (settingsCtx: Context) => {
    settingsCtx.settings.register(WECOM_SETTINGS_NAMESPACE, z.object({}), { applies: 'live', base: {} })
  })
  ctx.on('tools/pre-execute', async (execution, next): Promise<PreToolDecision> => {
    const runtime = runtimeTools.get(execution.name)
    if (runtime === undefined) return next()
    return runtime.preDecision(execution.arguments)
  })
  await Promise.all([host.initialize(), channelHost.initialize()])
}

export type { WeComAuthSnapshot } from './remote-types.ts'
