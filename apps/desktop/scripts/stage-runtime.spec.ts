import { createHash } from 'node:crypto'
import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { augmentDesktopRuntimeClosure, breakRuntimeHardlinks, buildEnvironment, createStageDirectory, materializeRuntimeLinks, signRuntimeExecutable, stagePluginManagerAssets, verifyPackageIntegrity, verifySha256 } from './stage-runtime.ts'

describe('runtime staging', () => {
  it('ad-hoc signs the bundled executable after copying it', () => {
    const calls: Array<{ command: string, args: string[] }> = []

    signRuntimeExecutable('/runtime/node/bin/node', (command, args) => calls.push({ command, args }))

    expect(calls).toEqual([{
      command: 'codesign',
      args: ['--force', '--sign', '-', '/runtime/node/bin/node'],
    }])
  })

  it('adds Desktop workspace capabilities to the packaged dsh dependency closure', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-runtime-closure-'))
    const cli = join(root, 'apps/cli/package.json')
    const desktop = join(root, 'apps/desktop/package.json')
    mkdirSync(join(root, 'apps/cli'), { recursive: true })
    mkdirSync(join(root, 'apps/desktop'), { recursive: true })
    writeFileSync(cli, JSON.stringify({ name: '@deepseek-ai/dsh', dependencies: { existing: 'workspace:^' } }))
    writeFileSync(desktop, JSON.stringify({ dependencies: {
      '@deepseek-ai/dsh': 'workspace:^',
      '@deepseek-ai/dsh-mail': 'workspace:^',
      pnpm: '11.7.0',
    } }))

    augmentDesktopRuntimeClosure(root)

    const manifest = JSON.parse(readFileSync(cli, 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies).toMatchObject({ existing: 'workspace:^', '@deepseek-ai/dsh-mail': 'workspace:^' })
    expect(manifest.dependencies).not.toHaveProperty('pnpm')
  })

  it('stages a fixed-name manager archive and startup bootstrap', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-manager-assets-'))
    const managerRoot = join(root, 'manager')
    const bootstrap = join(root, 'ensure-plugin-manager.mjs')
    const staged = join(root, 'runtime')
    mkdirSync(managerRoot)
    writeFileSync(bootstrap, 'export function ensurePluginManager() {}\n')

    stagePluginManagerAssets(managerRoot, bootstrap, staged, (_source, destination) => {
      writeFileSync(join(destination, 'dsh-plugin-manager-0.1.0.tgz'), 'archive')
    })

    expect(readFileSync(join(staged, 'plugins/dsh-plugin-manager.tgz'), 'utf8')).toBe('archive')
    expect(readFileSync(join(staged, 'app/ensure-plugin-manager.mjs'), 'utf8'))
      .toBe('export function ensurePluginManager() {}\n')
  })

  it('rejects a lockfile whose bundled package integrity is not pinned', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-lock-integrity-'))
    const lock = join(root, 'pnpm-lock.yaml')
    writeFileSync(lock, "packages:\n\n  pnpm@11.7.0:\n    resolution: {integrity: sha512-wrong}\n")
    expect(() => verifyPackageIntegrity(lock, 'pnpm', '11.7.0', 'sha512-expected')).toThrow(/integrity mismatch/)
  })

  it('creates staging outside the Desktop source tree on a fresh checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-stage-parent-'))
    const destination = join(root, 'missing', 'resources', 'runtime')
    const stagingParent = join(root, 'packaging-root')
    const stage = createStageDirectory(destination, stagingParent)
    expect(lstatSync(stage).isDirectory()).toBe(true)
    expect(stage.startsWith(stagingParent)).toBe(true)
    expect(lstatSync(join(root, 'missing', 'resources')).isDirectory()).toBe(true)
  })

  it('runs assembly tools with the pinned Node and archived upstream commit', () => {
    const environment = buildEnvironment(
      '/runtime/node/bin/node',
      'b150a551b8d465e31e418e1b2eaf5e79bbb7d28e',
      { PATH: '/host/bin', TOKEN: 'kept' },
    )
    expect(environment.PATH).toBe(`/runtime/node/bin${delimiter}/host/bin`)
    expect(environment.DSH_CLIENT_COMMIT_HASH).toBe('b150a551b8d465e31e418e1b2eaf5e79bbb7d28e')
    expect(environment.TOKEN).toBe('kept')
  })

  it('accepts only the pinned archive checksum', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'dsh-stage-')), 'node.tgz')
    writeFileSync(path, 'official bytes')
    const checksum = createHash('sha256').update('official bytes').digest('hex')
    expect(() => verifySha256(path, checksum)).not.toThrow()
    expect(() => verifySha256(path, '0'.repeat(64))).toThrow(/checksum mismatch/)
  })

  it('materializes package links without copying nested dependency trees', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-links-'))
    const target = join(root, 'target')
    const nodeModules = join(root, 'node_modules')
    mkdirSync(join(target, 'node_modules'), { recursive: true })
    mkdirSync(nodeModules)
    writeFileSync(join(target, 'lib.js'), 'built package')
    writeFileSync(join(target, 'node_modules/duplicate.js'), 'duplicate')
    symlinkSync(target, join(nodeModules, 'package'))

    materializeRuntimeLinks(nodeModules)

    expect(lstatSync(join(nodeModules, 'package')).isSymbolicLink()).toBe(false)
    expect(lstatSync(join(nodeModules, 'package/lib.js')).isFile()).toBe(true)
    expect(() => lstatSync(join(nodeModules, 'package/node_modules'))).toThrow()
  })

  it('materializes the pnpm bin as a location-correct private launcher', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-pnpm-bin-'))
    const nodeModules = join(root, 'node_modules')
    mkdirSync(join(nodeModules, '.bin'), { recursive: true })
    mkdirSync(join(nodeModules, 'pnpm/bin'), { recursive: true })
    writeFileSync(join(nodeModules, 'pnpm/bin/pnpm.cjs'), "import('./pnpm.mjs')\n")
    symlinkSync('../pnpm/bin/pnpm.cjs', join(nodeModules, '.bin/pnpm'))

    materializeRuntimeLinks(nodeModules)

    expect(lstatSync(join(nodeModules, '.bin/pnpm')).isSymbolicLink()).toBe(false)
    expect(readFileSync(join(nodeModules, '.bin/pnpm'), 'utf8')).toBe(
      "#!/usr/bin/env node\nimport '../pnpm/bin/pnpm.cjs'\n",
    )
  })

  it('isolates staged files from hardlinked workspace and store files', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-hardlinks-'))
    const source = join(root, 'source.js')
    const runtime = join(root, 'runtime')
    mkdirSync(runtime)
    writeFileSync(source, 'original')
    linkSync(source, join(runtime, 'client.js'))

    breakRuntimeHardlinks(runtime)
    writeFileSync(source, 'changed outside runtime')

    expect(readFileSync(join(runtime, 'client.js'), 'utf8')).toBe('original')
    expect(statSync(join(runtime, 'client.js')).ino).not.toBe(statSync(source).ino)
  })
})
