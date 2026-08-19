import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildHermeticEnvironment } from '../../../plugins/mail/scripts/release-env.mjs'

const desktop = resolve(import.meta.dirname, '..')
const packaging = resolve(desktop, '../..')
const runtime = join(desktop, 'src-tauri/resources/runtime')
const node = join(runtime, 'node/bin/node')
const cli = join(runtime, 'app/node_modules/@deepseek-ai/dsh/lib/bin.js')
const packageBin = join(runtime, 'app/node_modules/.bin')
const mailManifest = JSON.parse(readFileSync(join(packaging, 'plugins/mail/package.json'), 'utf8')) as { version: string }
const archive = join(packaging, `plugins/mail/dsh-mail-${mailManifest.version}.tgz`)
const runtimeRequire = createRequire(join(runtime, 'app/package.json'))
const runtimeDependencies = [
  '@deepseek-ai/schemastery',
  'html-to-text',
  'imapflow',
  'mailparser',
  'mime-types',
  'nodemailer',
  'zod',
]

function run(env: NodeJS.ProcessEnv, args: string[]) {
  return spawnSync(node, [cli, ...args], {
    encoding: 'utf8',
    env,
  })
}

interface WebInspection {
  stdout: string
  stderr: string
  html: string
  client: string
  settings: unknown
}

async function inspectWeb(origin: string): Promise<Pick<WebInspection, 'html' | 'client' | 'settings'>> {
  const html = await fetch(origin).then(async response => {
    if (!response.ok) throw new Error(`Web root returned HTTP ${response.status}`)
    return response.text()
  })
  const client = await fetch(new URL('/plugins/dsh-mail/client.js', origin)).then(async response => {
    if (!response.ok) throw new Error(`Mail Client returned HTTP ${response.status}`)
    return response.text()
  })
  const rpcId = 'mail-settings-load-e2e'
  const response = await fetch(new URL('/api/mailSettings/load', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: 'mailSettings/load',
      payload: { args: {} },
    }),
  })
  if (!response.ok) throw new Error(`mailSettings/load returned HTTP ${response.status}`)
  const envelope = await response.json() as {
    rpcId?: string
    result?: { ok?: boolean; value?: unknown; error?: unknown }
  }
  if (envelope.rpcId !== rpcId || envelope.result?.ok !== true) {
    throw new Error(`mailSettings/load failed: ${JSON.stringify(envelope)}`)
  }
  return { html, client, settings: envelope.result.value }
}

function bootWeb(env: NodeJS.ProcessEnv): Promise<WebInspection> {
  return new Promise((resolveBoot, rejectBoot) => {
    const child = spawn(node, [cli, '--profile', 'web', '--host', '127.0.0.1', '--port', '0'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let ready = false
    let inspection: Pick<WebInspection, 'html' | 'client' | 'settings'> | undefined
    let inspectionError: unknown
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!ready && /dsh web: http:\/\/127\.0\.0\.1:\d+/u.test(stdout)) {
        ready = true
        const origin = stdout.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+)/u)?.[1]
        if (origin === undefined) {
          inspectionError = new Error(`could not parse Web origin from ${stdout}`)
          child.kill('SIGTERM')
          return
        }
        void inspectWeb(origin).then(value => {
          inspection = value
        }, error => {
          inspectionError = error
        }).finally(() => { child.kill('SIGTERM') })
      }
    })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectBoot(new Error(`installed plugin did not reach Web startup\nstdout:\n${stdout}\nstderr:\n${stderr}`))
    }, 60_000)
    child.on('error', error => {
      clearTimeout(timer)
      rejectBoot(error)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (!ready) {
        rejectBoot(new Error(`installed plugin exited before Web startup (${String(code)})\nstdout:\n${stdout}\nstderr:\n${stderr}`))
        return
      }
      if (inspectionError !== undefined) {
        rejectBoot(inspectionError)
        return
      }
      if (inspection === undefined) {
        rejectBoot(new Error('Web exited before release inspection completed'))
        return
      }
      resolveBoot({ stdout, stderr, ...inspection })
    })
  })
}

interface ClientHandoff {
  id: string
  factory(require: (specifier: string) => unknown): Record<string, unknown>
}

async function runtimeModule(specifier: string): Promise<unknown> {
  return import(pathToFileURL(runtimeRequire.resolve(specifier)).href)
}

/** Execute the served handoff and activate its real Cordis lifecycle against deterministic service fakes. */
async function activateServedClient(code: string, loadedSettings: unknown): Promise<{ activated: boolean; failures: string[] }> {
  const failures: string[] = []
  let handoff: ClientHandoff | undefined
  const priorWindow = (globalThis as { window?: unknown }).window
  ;(globalThis as { window?: unknown }).window = {
    __ModuleLoader__: { load(value: ClientHandoff) { handoff = value } },
  }
  try {
    Function(code)()
    if (handoff === undefined) throw new Error('served Client bundle did not register a loader handoff')
    if (handoff.id !== 'dsh-mail') throw new Error(`served Client registered unexpected id ${handoff.id}`)
    const modules = new Map<string, unknown>(await Promise.all([
      '@deepseek-ai/cordis',
      'react',
      'react/jsx-runtime',
    ].map(async specifier => [specifier, await runtimeModule(specifier)] as const)))
    modules.set('@deepseek-ai/dsh-client-ui-primitives', { IconChevronDownOutline14: () => undefined })
    modules.set('@deepseek-ai/dsh-client-runtime/client', {
      createSnapshotStore(initial: unknown) {
        let value = initial
        const listeners = new Set<() => void>()
        return {
          getSnapshot: () => value,
          set(next: unknown) { value = next; for (const listener of listeners) listener() },
          subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
        }
      },
    })
    const exports = handoff.factory(specifier => {
      if (!modules.has(specifier)) throw new Error(`served Client required unknown runtime module ${specifier}`)
      return modules.get(specifier)
    })
    const Context = (modules.get('@deepseek-ai/cordis') as { Context: new () => {
      provide(name: string, value: unknown): unknown
      plugin(plugin: unknown): { await(): Promise<unknown>; dispose(): Promise<void> }
      fiber: { dispose(): Promise<void> }
    } }).Context
    const ctx = new Context()
    const slots = new Set<string>()
    const remote = {
      mailSettings: {
        load: async () => ({ ok: true, value: loadedSettings }),
        save: async ({ settings }: { settings: unknown }) => ({ ok: true, value: { settings } }),
      },
      $mount: async () => async () => undefined,
      $on: () => () => undefined,
    }
    ctx.provide('remote', remote)
    ctx.provide('remote.mailSettings', remote.mailSettings)
    ctx.provide('connection', {
      api: { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
    })
    ctx.provide('locale', { register: () => () => undefined })
    ctx.provide('settingsScope', {})
    ctx.provide('slots', {
      register(options: { id: string }) {
        slots.add(options.id)
        return () => { slots.delete(options.id) }
      },
      inject(_name: string, register: () => Iterable<() => void>) {
        const disposers = [...register()]
        return () => { for (const dispose of disposers.reverse()) dispose() }
      },
    })
    const fiber = ctx.plugin({ inject: exports.inject, apply: exports.apply })
    try {
      await fiber.await()
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error))
    }
    const activated = slots.has('mail')
    await fiber.dispose()
    await ctx.fiber.dispose()
    return { activated, failures }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error))
    return { activated: false, failures }
  } finally {
    if (priorWindow === undefined) delete (globalThis as { window?: unknown }).window
    else (globalThis as { window?: unknown }).window = priorWindow
  }
}

describe('packaged native dsh plugin installation', () => {
  it('installs the complete mail archive once and boots it immediately', { timeout: 120_000 }, async () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'dsh-desktop-plugin-e2e-'))
    const home = join(sandbox, 'dsh')
    const env = buildHermeticEnvironment({
      root: join(sandbox, 'environment'),
      dshHome: home,
      nodeBin: dirname(node),
      packageBin,
      offline: true,
    })
    expect(readdirSync(env.npm_config_store_dir)).toEqual([])
    expect(readdirSync(env.npm_config_cache)).toEqual([])
    expect(readdirSync(env.XDG_DATA_HOME)).toEqual([])
    expect(readdirSync(env.XDG_CONFIG_HOME)).toEqual([])
    for (const key of Object.keys(env)) {
      expect(key).not.toMatch(/NODE_PATH|NODE_OPTIONS|proxy|npm_config_(?:config|globalconfig)|pnpm_(?:config|store)/iu)
    }
    const install = run(env, ['plugin', '--profile', 'web', 'add', archive])
    expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0)

    const profile = join(home, 'profiles/web')
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }
    expect(manifest.dependencies?.['dsh-mail']).toBeTruthy()
    expect(manifest.dependencies?.['dsh-mail']).not.toContain('link:')
    expect(manifest.dsh?.profile?.bundles?.filter(name => name === 'dsh-mail')).toHaveLength(1)

    const probe = spawnSync(node, ['--input-type=module', '--eval', [
      `import { createRequire } from 'node:module'`,
      `import { pathToFileURL } from 'node:url'`,
      `import { dirname, join } from 'node:path'`,
      `const require = createRequire(${JSON.stringify(join(profile, 'package.json'))})`,
      `const packageRoot = dirname(require.resolve('dsh-mail/package.json'))`,
      `const pluginRequire = createRequire(join(packageRoot, 'package.json'))`,
      `for (const name of ${JSON.stringify(runtimeDependencies)}) pluginRequire.resolve(name)`,
      `for (const artifact of ['index.js', 'client.js', 'typert.host.js', 'typert.remote-client.js']) require.resolve(join(packageRoot, 'lib', artifact))`,
      `const { NodeMailTransport } = await import(pathToFileURL(join(packageRoot, 'lib/transport.js')).href)`,
      `const transport = new NodeMailTransport()`,
      `const config = { username: 'user@example.com', passwordRef: { provider: 'env', key: 'MAIL_PASSWORD' }, mailbox: 'INBOX', imap: { host: 'imap.example.com', port: 143, secure: false }, smtp: { host: 'smtp.example.com', port: 587, secure: false } }`,
      `await transport.list(config, 'secret', { limit: 1 }).then(() => { throw new Error('insecure IMAP accepted') }, error => { if (!String(error).includes('IMAP must use TLS')) throw error })`,
      `await transport.send(config, 'secret', { to: ['to@example.com'], subject: 'test', text: 'test' }).then(() => { throw new Error('insecure SMTP accepted') }, error => { if (!String(error).includes('SMTP must use TLS')) throw error })`,
    ].join(';')], { encoding: 'utf8', env })
    expect(probe.status, `${probe.stdout}\n${probe.stderr}`).toBe(0)

    const dump = run(env, ['--profile', 'web', '--dump-config'])
    expect(dump.status, `${dump.stdout}\n${dump.stderr}`).toBe(0)
    expect(dump.stdout).toContain('dsh-mail')
    expect(dump.stdout).toContain('secure: true')

    const web = await bootWeb(env)
    expect(web.stdout).toMatch(/dsh web: http:\/\/127\.0\.0\.1:\d+/u)
    expect(web.stderr).not.toMatch(/failed to apply loader entry|did not activate/u)
    expect(web.html).toContain('"id":"dsh-mail"')
    expect(web.html).toContain('/plugins/dsh-mail/client.js')
    expect(web.settings).toEqual({
      settings: {
        username: 'you@example.com',
        passwordEnv: 'MAIL_APP_PASSWORD',
        mailbox: 'INBOX',
        archiveMailbox: 'Archive',
        allowDelete: false,
        imap: { host: '', port: 993, secure: true },
        smtp: { host: '', port: 465, secure: true },
      },
    })
    const activation = await activateServedClient(web.client, web.settings)
    expect(activation).toEqual({ activated: true, failures: [] })
  })
})
