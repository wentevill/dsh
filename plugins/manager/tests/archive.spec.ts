import { createGzip } from 'node:zlib'
import { createWriteStream } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { pack } from 'tar-stream'
import { inspectPluginArchive } from '../src/archive.ts'
import { PluginManagerError } from '../src/errors.ts'
import { classifyInstallAction } from '../src/version.ts'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

interface Entry {
  name: string
  body?: string
  type?: 'file' | 'directory' | 'symlink'
  linkname?: string
}

async function archive(entries: readonly Entry[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'plugin-manager-archive-'))
  roots.push(root)
  const path = join(root, 'plugin.tgz')
  const tar = pack()
  for (const entry of entries) {
    tar.entry({
      name: entry.name,
      type: entry.type ?? 'file',
      linkname: entry.linkname,
    }, entry.body ?? '')
  }
  tar.finalize()
  await pipeline(tar, createGzip(), createWriteStream(path))
  return path
}

function validEntries(overrides: Partial<Record<'name' | 'version' | 'patch', string>> = {}): Entry[] {
  const manifest = {
    name: overrides.name ?? 'dsh-example',
    version: overrides.version ?? '1.2.3',
    type: 'module',
    main: 'lib/index.js',
    files: ['lib', 'cordis.patch.yml'],
    dsh: { bundle: { patch: overrides.patch ?? './cordis.patch.yml' } },
  }
  return [
    { name: 'package/package.json', body: JSON.stringify(manifest) },
    { name: 'package/lib/index.js', body: 'export function apply() {}\n' },
    { name: 'package/cordis.patch.yml', body: '[]\n' },
  ]
}

describe('inspectPluginArchive', () => {
  it('returns npm identity for a complete DSH bundle', async () => {
    const path = await archive(validEntries())
    await expect(inspectPluginArchive(path)).resolves.toMatchObject({
      packageName: 'dsh-example',
      version: '1.2.3',
      bundlePatch: 'cordis.patch.yml',
    })
  })

  it('rejects traversal before trusting package metadata', async () => {
    const path = await archive([...validEntries(), { name: 'package/../escaped', body: 'bad' }])
    await expect(inspectPluginArchive(path)).rejects.toMatchObject({ code: 'ARCHIVE_UNSAFE_ENTRY' })
  })

  it('rejects links', async () => {
    const path = await archive([...validEntries(), {
      name: 'package/lib/linked.js', type: 'symlink', linkname: '/tmp/target',
    }])
    await expect(inspectPluginArchive(path)).rejects.toBeInstanceOf(PluginManagerError)
  })

  it('rejects missing declared bundle artifacts', async () => {
    const path = await archive(validEntries({ patch: './missing.yml' }))
    await expect(inspectPluginArchive(path)).rejects.toMatchObject({ code: 'PACKAGE_INCOMPLETE' })
  })

  it('rejects local dependency specifications', async () => {
    const entries = validEntries()
    const manifest = JSON.parse(entries[0]!.body!)
    manifest.dependencies = { unsafe: 'workspace:*' }
    entries[0] = { ...entries[0]!, body: JSON.stringify(manifest) }
    const path = await archive(entries)
    await expect(inspectPluginArchive(path)).rejects.toMatchObject({ code: 'PACKAGE_DEPENDENCY_UNSAFE' })
  })
})

describe('classifyInstallAction', () => {
  it('classifies install, upgrade, reinstall, and downgrade from semver versions', () => {
    expect(classifyInstallAction(undefined, '1.0.0')).toBe('install')
    expect(classifyInstallAction('1.0.0', '1.1.0')).toBe('upgrade')
    expect(classifyInstallAction('1.0.0', '1.0.0')).toBe('reinstall')
    expect(classifyInstallAction('2.0.0', '1.9.9')).toBe('downgrade')
  })
})
