import { execFileSync, spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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
    const mailManifest = JSON.parse(readFileSync(resolve(root, 'plugins/mail/package.json'), 'utf8')) as { version: string }
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
    expect(output).toContain(`dsh-mail-${mailManifest.version}.tgz`)
    expect(output.match(/plugin --profile/g)).toHaveLength(1)
  })

  it('resolves the mail archive from the package manifest version', () => {
    const fixture = mkdtempSync(resolve(tmpdir(), 'dsh-mail-make-'))
    try {
      mkdirSync(resolve(fixture, 'plugins/mail'), { recursive: true })
      copyFileSync(resolve(root, 'Makefile'), resolve(fixture, 'Makefile'))
      writeFileSync(resolve(fixture, 'plugins/mail/package.json'), JSON.stringify({ version: '9.8.7' }))
      const output = execFileSync('make', ['-n', 'install-plugin'], { cwd: fixture, encoding: 'utf8' })
      expect(output).toContain('plugins/mail/dsh-mail-9.8.7.tgz')
    } finally {
      rmSync(fixture, { recursive: true, force: true })
    }
  })

  it('rejects unsupported plugin packages', () => {
    const result = spawnSync('make', ['-n', 'pack-plugin', 'PLUGIN=unknown'], { cwd: root, encoding: 'utf8' })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('unsupported PLUGIN=unknown')
  })
})
