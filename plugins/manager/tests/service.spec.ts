import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { pack } from 'tar-stream'
import { PluginCli, type CommandRunner } from '../src/cli.ts'
import { PluginManagerService } from '../src/service.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function packageArchive(root: string, name: string, version: string): Promise<Buffer> {
  const path = join(root, `${name}-${version}.tgz`)
  const tar = pack()
  tar.entry({ name: 'package/package.json' }, JSON.stringify({
    name, version, main: './lib/index.js',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  tar.entry({ name: 'package/lib/index.js' }, 'export function apply() {}\n')
  tar.entry({ name: 'package/cordis.patch.yml' }, '[]\n')
  tar.finalize()
  await pipeline(tar, createGzip(), createWriteStream(path))
  return readFile(path)
}

async function fixture(installed?: { name: string; version: string }) {
  const root = await mkdtemp(join(tmpdir(), 'plugin-manager-service-'))
  roots.push(root)
  const profileDir = join(root, 'home/profiles/web')
  const uploadRoot = join(root, 'uploads')
  await mkdir(profileDir, { recursive: true })
  const dependencies: Record<string, string> = {}
  if (installed) {
    dependencies[installed.name] = installed.version
    const packageDir = join(profileDir, 'node_modules', ...installed.name.split('/'))
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({
      name: installed.name,
      version: installed.version,
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }))
  }
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ dependencies }))
  const calls: readonly string[][] = []
  const mutableCalls = calls as string[][]
  const runner: CommandRunner = async (_command, args) => {
    mutableCalls.push([...args])
    return { code: 0, stderr: '' }
  }
  const cli = new PluginCli({
    node: '/runtime/node', dsh: '/runtime/dsh.js', packageBin: '/runtime/.bin', dshHome: join(root, 'home'),
  }, runner)
  const service = new PluginManagerService({ profileDir, uploadRoot, cli })
  return { root, uploadRoot, service, calls }
}

describe('PluginManagerService upload lifecycle', () => {
  it('installs one sequentially uploaded package and retains its file-backed dependency', async () => {
    const { root, uploadRoot, service, calls } = await fixture()
    const bytes = await packageArchive(root, 'dsh-example', '1.2.3')
    const session = await service.begin({ fileName: 'dsh-example.tgz', size: bytes.length })
    await service.append({ uploadId: session.uploadId, index: 0, bytes })
    await expect(service.finish({ uploadId: session.uploadId })).resolves.toEqual({
      action: 'install', packageName: 'dsh-example', version: '1.2.3', requiresRestart: true,
    })
    expect(calls[0]?.slice(1, 7)).toEqual(['plugin', '--profile', 'web', 'add', '--ignore-scripts', expect.stringMatching(/\.tgz$/u)])
    const retained = await readdir(uploadRoot)
    expect(retained).toHaveLength(1)
    await expect(stat(join(uploadRoot, retained[0]!))).resolves.toMatchObject({ size: bytes.length })
  })

  it('rejects out-of-order chunks and removes cancelled uploads', async () => {
    const { uploadRoot, service } = await fixture()
    const session = await service.begin({ fileName: 'plugin.tgz', size: 3 })
    await expect(service.append({ uploadId: session.uploadId, index: 1, bytes: new Uint8Array([1]) }))
      .rejects.toMatchObject({ code: 'UPLOAD_SEQUENCE_INVALID' })
    await service.cancel({ uploadId: session.uploadId })
    expect(await readdir(uploadRoot)).toEqual([])
  })

  it('blocks downgrades before invoking the CLI', async () => {
    const { root, service, calls } = await fixture({ name: 'dsh-example', version: '2.0.0' })
    const bytes = await packageArchive(root, 'dsh-example', '1.0.0')
    const session = await service.begin({ fileName: 'plugin.tgz', size: bytes.length })
    await service.append({ uploadId: session.uploadId, index: 0, bytes })
    await expect(service.finish({ uploadId: session.uploadId })).rejects.toMatchObject({ code: 'DOWNGRADE_BLOCKED' })
    expect(calls).toEqual([])
  })

  it('protects the manager from package replacement and uninstall', async () => {
    const { root, service, calls } = await fixture({ name: 'dsh-plugin-manager', version: '0.1.0' })
    const bytes = await packageArchive(root, 'dsh-plugin-manager', '0.2.0')
    const session = await service.begin({ fileName: 'manager.tgz', size: bytes.length })
    await service.append({ uploadId: session.uploadId, index: 0, bytes })
    await expect(service.finish({ uploadId: session.uploadId })).rejects.toMatchObject({ code: 'MANAGER_PROTECTED' })
    await expect(service.uninstall({ packageName: 'dsh-plugin-manager', expectedVersion: '0.1.0' }))
      .rejects.toMatchObject({ code: 'MANAGER_PROTECTED' })
    expect(calls).toEqual([])
  })
})
