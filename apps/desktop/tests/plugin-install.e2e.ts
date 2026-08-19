import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const desktop = resolve(import.meta.dirname, '..')
const packaging = resolve(desktop, '../..')
const runtime = join(desktop, 'src-tauri/resources/runtime')
const node = join(runtime, 'node/bin/node')
const cli = join(runtime, 'app/node_modules/@deepseek-ai/dsh/lib/bin.js')
const packageBin = join(runtime, 'app/node_modules/.bin')
const mailManifest = JSON.parse(readFileSync(join(packaging, 'plugins/mail/package.json'), 'utf8')) as { version: string }
const archive = join(packaging, `plugins/mail/dsh-mail-${mailManifest.version}.tgz`)
const runtimeDependencies = [
  '@deepseek-ai/schemastery',
  'html-to-text',
  'imapflow',
  'mailparser',
  'mime-types',
  'nodemailer',
  'zod',
]

function run(home: string, args: string[]) {
  return spawnSync(node, [cli, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      DSH_HOME: home,
      PATH: [join(runtime, 'node/bin'), packageBin, '/usr/bin', '/bin'].join(delimiter),
      NODE_OPTIONS: '',
      NODE_PATH: '',
    },
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

function bootWeb(home: string): Promise<WebInspection> {
  return new Promise((resolveBoot, rejectBoot) => {
    const child = spawn(node, [cli, '--profile', 'web', '--host', '127.0.0.1', '--port', '0'], {
      env: {
        ...process.env,
        DSH_HOME: home,
        PATH: [join(runtime, 'node/bin'), packageBin, '/usr/bin', '/bin'].join(delimiter),
        NODE_OPTIONS: '',
        NODE_PATH: '',
      },
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

describe('packaged native dsh plugin installation', () => {
  it('installs the complete mail archive once and boots it immediately', { timeout: 120_000 }, async () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-plugin-home-'))
    const install = run(home, ['plugin', '--profile', 'web', 'add', archive])
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
    ].join(';')], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } })
    expect(probe.status, `${probe.stdout}\n${probe.stderr}`).toBe(0)

    const dump = run(home, ['--profile', 'web', '--dump-config'])
    expect(dump.status, `${dump.stdout}\n${dump.stderr}`).toBe(0)
    expect(dump.stdout).toContain('dsh-mail')
    expect(dump.stdout).toContain('secure: true')

    const web = await bootWeb(home)
    expect(web.stdout).toMatch(/dsh web: http:\/\/127\.0\.0\.1:\d+/u)
    expect(web.stderr).not.toMatch(/failed to apply loader entry|did not activate/u)
    expect(web.html).toContain('"id":"dsh-mail"')
    expect(web.html).toContain('/plugins/dsh-mail/client.js')
    expect(web.client).toMatch(/window\.__ModuleLoader__\.load\(\{\s*id:\s*"dsh-mail"/u)
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
  })
})
