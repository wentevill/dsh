import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

function dryRun(target: string, overrides: string[] = []): string {
  return execFileSync('make', ['-n', target, ...overrides], { cwd: root, encoding: 'utf8' })
}

describe('Desktop Make commands', () => {
  it('delegates release, development, and mail packaging to their owned scripts', () => {
    expect(dryRun('release-dmg')).toContain('corepack pnpm desktop:build')
    expect(dryRun('run')).toContain('corepack pnpm --dir apps/desktop dev')
    const pack = dryRun('pack-plugin')
    expect(pack).toContain('scripts/pack-release.mjs')
    expect(pack).toContain('app/node_modules/.bin/pnpm')
    expect(pack).not.toContain('corepack')
  })

  it('delegates WeCom packaging to its owned script', () => {
    expect(dryRun('pack-plugin', ['PLUGIN=wecom'])).toContain('corepack pnpm wecom:pack')
  })

  it('installs the selected WeCom archive into the requested profile', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'plugins/wecom/package.json'), 'utf8')) as { version: string }
    const output = dryRun('install-plugin', [
      'PLUGIN=wecom', 'PROFILE=custom', 'APP_PATH=/tmp/DeepSeek Harness.app',
    ])
    expect(output).toContain(`plugins/wecom/dsh-wecom-${manifest.version}.tgz`)
    expect(output).toContain('plugin --profile "custom" add')
    expect(output.match(/plugin --profile/g)).toHaveLength(1)
  })

  it('installs mail with only the installed app runtime and Desktop profile home', () => {
    const output = dryRun('install-plugin', [
      'APP_PATH=/tmp/DeepSeek Harness.app',
      'DESKTOP_DSH_HOME=/tmp/Desktop Harness Home',
      'PROFILE=custom',
    ])
    expect(output).toContain('--dsh-home "/tmp/Desktop Harness Home"')
    expect(output).toContain('"/tmp/DeepSeek Harness.app/Contents/Resources/runtime/node/bin/node"')
    expect(output).toContain('--cli "/tmp/DeepSeek Harness.app/Contents/Resources/runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js"')
    expect(output).toContain('--profile "custom"')
    expect(output).toContain('dsh-mail-$PLUGIN_VERSION.tgz')
    expect(output.match(/--profile/g)).toHaveLength(1)
    expect(output).toContain('NODE_PATH=')
    expect(output).toContain('NODE_OPTIONS=')
    expect(output).toContain('PLUGIN_VERSION="$("/tmp/DeepSeek Harness.app/Contents/Resources/runtime/node/bin/node"')
  })

  it('executes the Mail version probe through a quoted bundled Node path', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'dsh mail make probe-'))
    try {
      copyFileSync(resolve(root, 'Makefile'), join(fixture, 'Makefile'))
      const app = join(fixture, 'DeepSeek Harness.app')
      const runtime = join(app, 'Contents/Resources/runtime')
      const node = join(runtime, 'node/bin/node')
      const packageBin = join(runtime, 'app/node_modules/.bin')
      const mail = join(fixture, 'plugins/mail')
      const scripts = join(mail, 'scripts')
      const log = join(fixture, 'probe.log')
      mkdirSync(join(runtime, 'node/bin'), { recursive: true })
      mkdirSync(join(runtime, 'app/node_modules/@deepseek-ai/dsh/lib'), { recursive: true })
      mkdirSync(packageBin, { recursive: true })
      mkdirSync(scripts, { recursive: true })
      writeFileSync(node, `#!/bin/sh\nprintf '[' >> "$PROBE_LOG"\nfor arg in "$@"; do printf '<%s>' "$arg" >> "$PROBE_LOG"; done\nprintf ']\\n' >> "$PROBE_LOG"\ncase "$*" in *--version*) printf '9.8.7\\n';; esac\n`)
      chmodSync(node, 0o755)
      writeFileSync(join(packageBin, 'pnpm'), '')
      chmodSync(join(packageBin, 'pnpm'), 0o755)
      writeFileSync(join(runtime, 'app/node_modules/@deepseek-ai/dsh/lib/bin.js'), '')
      writeFileSync(join(scripts, 'pack-release.mjs'), '')
      writeFileSync(join(scripts, 'install-release.mjs'), '')
      writeFileSync(join(mail, 'dsh-mail-9.8.7.tgz'), '')

      execFileSync('make', ['install-plugin', `APP_PATH=${app}`, 'DESKTOP_DSH_HOME=/tmp/Desktop Profile'], {
        cwd: fixture,
        env: { ...process.env, PROBE_LOG: log },
      })
      const calls = readFileSync(log, 'utf8').trim().split('\n')
      const realScripts = join(realpathSync(fixture), 'plugins/mail/scripts')
      expect(calls).toHaveLength(3)
      expect(calls[1]).toContain(`<${join(realScripts, 'pack-release.mjs')}><--version>`)
      expect(calls[2]).toContain(`<${join(realScripts, 'install-release.mjs')}>`)
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('rejects unsupported plugin packages', () => {
    const result = spawnSync('make', ['-n', 'pack-plugin', 'PLUGIN=unknown'], { cwd: root, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('unsupported PLUGIN=unknown')
    expect(`${result.stdout}${result.stderr}`).toContain('supported plugins: mail wecom')
  })
})
