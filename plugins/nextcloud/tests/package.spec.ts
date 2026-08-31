import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

describe('dsh-nextcloud package', () => {
  it('declares only client injections shipped by the pinned upstream', () => {
    const upstream = resolve(root, '../../upstream')
    const manifests = execFileSync('git', ['ls-files', '**/package.json'], {
      cwd: upstream,
      encoding: 'utf8',
    }).trim().split('\n').filter(Boolean)
    const upstreamPackages = new Set(manifests.flatMap(path => {
      const value = JSON.parse(readFileSync(resolve(upstream, path), 'utf8')) as { name?: unknown }
      return typeof value.name === 'string' ? [value.name] : []
    }))
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dsh: { client: { inject: string[] } }
    }

    expect(manifest.dsh.client.inject.filter(name => !upstreamPackages.has(name))).toEqual([])
  })

  it('declares a separately installable Host and Web client plugin', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      name: string
      version: string
      dependencies: Record<string, string>
      peerDependencies: Record<string, string>
      files: string[]
      dsh: { bundle: { patch: string }; client: { platform: string } }
    }
    expect(manifest.name).toBe('dsh-nextcloud')
    expect(manifest.version).toMatch(/^0\.1\.0$/u)
    expect(manifest.dependencies.webdav).toBe('5.10.0')
    expect(manifest.peerDependencies).toHaveProperty('@deepseek-ai/dsh-credentials')
    expect(manifest.peerDependencies).toHaveProperty('@deepseek-ai/dsh-tools')
    expect(manifest.dsh).toMatchObject({ bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } })
    expect(manifest.files).toEqual(expect.arrayContaining(['lib', 'cordis.patch.yml', 'README.md', 'LICENSE']))
    expect(manifest.files).not.toContain('src')
  })

  it('is selectable through the repository pack and install Make targets', () => {
    const packagingRoot = resolve(root, '../..')
    const output = execFileSync('make', ['-n', 'pack-plugin', 'PLUGIN=nextcloud'], { cwd: packagingRoot, encoding: 'utf8' })
    expect(output).toContain('pnpm nextcloud:pack')
    const manifest = JSON.parse(readFileSync(resolve(packagingRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    expect(manifest.scripts['nextcloud:pack']).toBe('corepack pnpm --dir plugins/nextcloud pack --pack-destination .')
  })

  it('packs a self-contained archive with the WebDAV runtime', () => {
    const destination = mkdtempSync(resolve(tmpdir(), 'dsh-nextcloud-pack-'))
    execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', destination], { cwd: root })
    const archive = resolve(destination, 'dsh-nextcloud-0.1.0.tgz')
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n')
    expect(entries).toContain('package/lib/index.js')
    expect(entries).toContain('package/lib/client.js')
    expect(entries.some(entry => entry.startsWith('package/node_modules/webdav/'))).toBe(true)
    expect(entries.some(entry => entry.startsWith('package/src/'))).toBe(false)
  }, 30_000)
})
