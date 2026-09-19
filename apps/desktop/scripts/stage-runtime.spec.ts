import { createHash } from 'node:crypto'
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { augmentDesktopRuntimeClosure, breakRuntimeHardlinks, buildEnvironment, createStageDirectory, installStagedRuntime, materializeRuntimeLinks, patchLegacyTypertCompatibility, removeRuntimeLink, signRuntimeExecutable, verifyPackageIntegrity, verifySha256 } from './stage-runtime.ts'

describe('runtime staging', () => {
  it('adapts legacy Typert schema objects into lazy codec factories', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-legacy-typert-'))
    const targets = [
      '@deepseek-ai/dsh-typert-loader/lib/index.js',
      '@deepseek-ai/dsh-typert-registry/lib/index.js',
      '@deepseek-ai/dsh-typert-registry/lib/client.js',
    ]
    const fixture = [
      'function schemaValue(schema) {',
      '  if (typeof schema.create !== "function") throw new Error("schema has no create() factory");',
      '  return schema.create().parse("schema-ok");',
      '}',
      'function codecValue(codec) {',
      '  if (typeof codec.create !== "function") throw new Error("codec has no create() factory");',
      '  return codec.create().parse("codec-ok");',
      '}',
      'const parser = { parse: value => value };',
      'export const values = [schemaValue({ schema: parser }), codecValue({ schema: parser })];',
      '',
    ].join('\n')
    for (const target of targets) {
      const path = join(root, 'node_modules', target)
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, fixture)
    }

    patchLegacyTypertCompatibility(root)

    for (const [index, target] of targets.entries()) {
      const module = await import(`${pathToFileURL(join(root, 'node_modules', target)).href}?v=${String(index)}`) as { values: string[] }
      expect(module.values).toEqual(['schema-ok', 'codec-ok'])
    }
  })

  it('ad-hoc signs the bundled executable after copying it', () => {
    const calls: Array<{ command: string, args: string[] }> = []

    signRuntimeExecutable('/runtime/node/bin/node', (command, args) => calls.push({ command, args }))

    expect(calls).toEqual([{
      command: 'codesign',
      args: ['--force', '--sign', '-', '/runtime/node/bin/node'],
    }])
  })

  it('reconciles the packaged dsh closure after replacing the upstream Desktop package', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-runtime-closure-'))
    const cli = join(root, 'apps/cli/package.json')
    const desktop = join(root, 'apps/desktop/package.json')
    const workspace = join(root, 'pnpm-workspace.yaml')
    const tsdown = join(root, 'tsdown.config.ts')
    mkdirSync(join(root, 'apps/cli'), { recursive: true })
    mkdirSync(join(root, 'apps/desktop'), { recursive: true })
    writeFileSync(cli, JSON.stringify({ name: '@deepseek-ai/dsh', dependencies: { existing: 'workspace:^' } }))
    writeFileSync(desktop, JSON.stringify({ dependencies: {
      '@deepseek-ai/dsh': 'workspace:^',
      '@deepseek-ai/dsh-mail': 'workspace:^',
      'dsh-plugin-manager': 'workspace:*',
      pnpm: '11.7.0',
    } }))
    writeFileSync(workspace, [
      'patchedDependencies:',
      "  '@electron/osx-sign@1.3.3': patches/@electron__osx-sign@1.3.3.patch",
      "  '@yao-pkg/pkg@6.21.0': patches/@yao-pkg__pkg@6.21.0.patch",
      '',
    ].join('\n'))
    writeFileSync(tsdown, "workspace: ['vendor/*', 'apps/cli', 'apps/desktop', 'apps/desktop-host'],\n")

    augmentDesktopRuntimeClosure(root)

    const manifest = JSON.parse(readFileSync(cli, 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies).toMatchObject({ existing: 'workspace:^', '@deepseek-ai/dsh-mail': 'workspace:^' })
    expect(manifest.dependencies).not.toHaveProperty('pnpm')
    expect(manifest.dependencies).not.toHaveProperty('dsh-plugin-manager')
    expect(readFileSync(workspace, 'utf8')).toBe([
      'patchedDependencies:',
      "  '@yao-pkg/pkg@6.21.0': patches/@yao-pkg__pkg@6.21.0.patch",
      '',
    ].join('\n'))
    expect(readFileSync(tsdown, 'utf8')).toBe(
      "workspace: ['vendor/*', 'apps/cli', 'apps/desktop-host'],\n",
    )
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

  it('atomically replaces a previously staged runtime directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-install-runtime-'))
    const staged = join(root, 'staged')
    const destination = join(root, 'runtime')
    mkdirSync(join(staged, 'app'), { recursive: true })
    mkdirSync(join(destination, 'old'), { recursive: true })
    writeFileSync(join(staged, 'app/new.js'), 'new runtime')
    writeFileSync(join(destination, 'old/stale.js'), 'stale runtime')

    installStagedRuntime(staged, destination)

    expect(readFileSync(join(destination, 'app/new.js'), 'utf8')).toBe('new runtime')
    expect(existsSync(join(destination, 'old/stale.js'))).toBe(false)
    expect(existsSync(staged)).toBe(false)
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

  it('removes deployed directory links without deleting their targets on Node 24', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-remove-link-'))
    const target = join(root, 'target')
    const link = join(root, 'link')
    mkdirSync(target)
    writeFileSync(join(target, 'kept.js'), 'kept')
    symlinkSync(target, link)

    removeRuntimeLink(link)

    expect(lstatSync(link, { throwIfNoEntry: false })).toBeUndefined()
    expect(readFileSync(join(target, 'kept.js'), 'utf8')).toBe('kept')
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
