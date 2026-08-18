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

function bootWeb(home: string): Promise<string> {
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
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk
      if (!ready && /dsh web: http:\/\/127\.0\.0\.1:\d+/u.test(stdout)) {
        ready = true
        child.kill('SIGTERM')
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
      resolveBoot(stdout)
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
      `for (const name of ['@deepseek-ai/schemastery', 'imapflow', 'mailparser', 'nodemailer']) require.resolve(name)`,
      `const packageRoot = dirname(require.resolve('dsh-mail/package.json'))`,
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

    await expect(bootWeb(home)).resolves.toMatch(/dsh web: http:\/\/127\.0\.0\.1:\d+/u)
  })
})
