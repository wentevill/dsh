import { spawnSync } from 'node:child_process'
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
const archive = join(packaging, 'plugins/mail/dsh-mail-plugin-0.1.0.tgz')

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

describe('packaged native dsh plugin installation', () => {
  it('installs the complete mail archive once and composes it immediately', { timeout: 120_000 }, () => {
    const home = mkdtempSync(join(tmpdir(), 'dsh-desktop-plugin-home-'))
    const install = run(home, ['plugin', '--profile', 'web', 'add', archive])
    expect(install.status, `${install.stdout}\n${install.stderr}`).toBe(0)

    const profile = join(home, 'profiles/web')
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { profile?: { bundles?: string[] } }
    }
    expect(manifest.dependencies?.['dsh-mail-plugin']).toBeTruthy()
    expect(manifest.dependencies?.['dsh-mail-plugin']).not.toContain('link:')
    expect(manifest.dsh?.profile?.bundles?.filter(name => name === 'dsh-mail-plugin')).toHaveLength(1)

    const probe = spawnSync(node, ['--input-type=module', '--eval', [
      `import { createRequire } from 'node:module'`,
      `const require = createRequire(${JSON.stringify(join(profile, 'package.json'))})`,
      `require.resolve('dsh-mail-plugin')`,
      `for (const name of ['@deepseek-ai/schemastery', 'imapflow', 'mailparser', 'nodemailer']) require.resolve(name)`,
    ].join(';')], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } })
    expect(probe.status, `${probe.stdout}\n${probe.stderr}`).toBe(0)

    const dump = run(home, ['--profile', 'web', '--dump-config'])
    expect(dump.status, `${dump.stdout}\n${dump.stderr}`).toBe(0)
    expect(dump.stdout).toContain('dsh-mail-plugin')
    expect(dump.stdout).toContain('secure: true')
  })
})
