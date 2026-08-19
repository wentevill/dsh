import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  })

  it('rejects unsupported plugin packages', () => {
    const result = spawnSync('make', ['-n', 'pack-plugin', 'PLUGIN=unknown'], { cwd: root, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('unsupported PLUGIN=unknown')
    expect(`${result.stdout}${result.stderr}`).toContain('supported plugins: mail wecom')
  })
})
