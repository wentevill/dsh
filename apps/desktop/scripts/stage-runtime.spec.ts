import { createHash } from 'node:crypto'
import { linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { breakRuntimeHardlinks, buildEnvironment, createStageDirectory, materializeRuntimeLinks, verifySha256 } from './stage-runtime.ts'

describe('runtime staging', () => {
  it('creates staging outside the Desktop source tree on a fresh checkout', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-stage-parent-'))
    const destination = join(root, 'missing', 'resources', 'runtime')
    const stagingParent = join(root, 'packaging-root')
    const stage = createStageDirectory(destination, stagingParent)
    expect(lstatSync(stage).isDirectory()).toBe(true)
    expect(stage.startsWith(stagingParent)).toBe(true)
    expect(lstatSync(join(root, 'missing', 'resources')).isDirectory()).toBe(true)
  })

  it('runs assembly tools with the pinned Node before the host PATH', () => {
    const environment = buildEnvironment('/runtime/node/bin/node', { PATH: '/host/bin', TOKEN: 'kept' })
    expect(environment.PATH).toBe(`/runtime/node/bin${delimiter}/host/bin`)
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
