import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pluginRoot = resolve(import.meta.dirname, '..')
const repositoryRoot = resolve(pluginRoot, '../..')

describe('standalone Cron plugin manifest', () => {
  it('publishes independent Host, Client, and Remote entry points', () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginRoot, 'package.json'), 'utf8')) as {
      name: string
      version: string
      engines: { node: string }
      exports: Record<string, unknown>
      files: string[]
      bundledDependencies: string[]
      dsh: { bundle: { patch: string }; client: { platform: string } }
    }

    expect(manifest).toMatchObject({
      name: 'dsh-cron', version: '0.1.0', engines: { node: '>=24' },
      files: ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE'],
      bundledDependencies: ['node-cron', 'zod'],
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    })
    expect(Object.keys(manifest.exports)).toEqual([
      '.', './client', './remote-types', './remote', './typert', './package.json',
    ])
  })

  it('is exposed through exact root test and pack scripts', () => {
    const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts['cron:test']).toBe('corepack pnpm --dir plugins/cron test')
    expect(manifest.scripts['cron:pack']).toBe('corepack pnpm --dir plugins/cron pack --pack-destination .')
  })

  it('packs release-only Host, Client, Typert and bundled runtime files', { timeout: 30_000 }, () => {
    const destination = mkdtempSync(join(tmpdir(), 'dsh-cron-pack-'))
    try {
      execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', destination], {
        cwd: pluginRoot, stdio: 'pipe',
      })
      const archive = join(destination, 'dsh-cron-0.1.0.tgz')
      const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
      expect(files).toEqual(expect.arrayContaining([
        'package/lib/index.js', 'package/lib/index.d.ts', 'package/lib/client.js',
        'package/lib/typert.host.js', 'package/lib/typert.host.d.ts',
        'package/lib/typert.remote-client.js', 'package/lib/typert.remote-client.d.ts',
        'package/cordis.patch.yml', 'package/README.md', 'package/LICENSE',
        'package/node_modules/node-cron/package.json', 'package/node_modules/zod/package.json',
      ]))
      expect(files.some(file => file.startsWith('package/src/') || file.startsWith('package/tests/'))).toBe(false)
      expect(files.some(file => file.includes('credential') || file.includes(repositoryRoot))).toBe(false)
    } finally {
      rmSync(destination, { recursive: true, force: true })
    }
  })

})
