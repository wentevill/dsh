import { execFileSync, spawnSync } from 'node:child_process'
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
    expect(dryRun('pack-plugin')).toContain('corepack pnpm mail:pack')
  })

  it('installs mail with only the installed app runtime and Desktop profile home', () => {
    const output = dryRun('install-plugin', [
      'APP_PATH=/tmp/DeepSeek Harness.app',
      'DESKTOP_DSH_HOME=/tmp/Desktop Harness Home',
      'PROFILE=custom',
    ])
    expect(output).toContain('DSH_HOME="/tmp/Desktop Harness Home"')
    expect(output).toContain('PATH="/tmp/DeepSeek Harness.app/Contents/Resources/runtime/node/bin:/tmp/DeepSeek Harness.app/Contents/Resources/runtime/app/node_modules/.bin:/usr/bin:/bin"')
    expect(output).toContain('"/tmp/DeepSeek Harness.app/Contents/Resources/runtime/node/bin/node"')
    expect(output).toContain('"/tmp/DeepSeek Harness.app/Contents/Resources/runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js"')
    expect(output).toContain('plugin --profile "custom" add')
    expect(output.match(/plugin --profile/g)).toHaveLength(1)
  })

  it('rejects unsupported plugin packages', () => {
    const result = spawnSync('make', ['-n', 'pack-plugin', 'PLUGIN=unknown'], { cwd: root, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('unsupported PLUGIN=unknown')
  })
})
