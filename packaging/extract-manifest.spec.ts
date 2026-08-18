import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildExtractionManifest, verifyExtractionManifest } from './extract-manifest.ts'

const fixtures: string[] = []

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-extraction-'))
  fixtures.push(root)
  mkdirSync(join(root, 'nested'))
  writeFileSync(join(root, 'z.txt'), 'z\n')
  writeFileSync(join(root, 'nested/a.txt'), 'a\n')
  return root
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('extraction manifest', () => {
  it('hashes regular files in deterministic path order', () => {
    const root = fixture()
    const manifest = buildExtractionManifest(root, ['z.txt', 'nested/a.txt'])
    expect(manifest.split('\n').filter(Boolean).map(line => line.slice(66)))
      .toEqual(['nested/a.txt', 'z.txt'])
    expect(() => verifyExtractionManifest(root, manifest)).not.toThrow()
  })

  it('detects changed and missing extracted files', () => {
    const root = fixture()
    const manifest = buildExtractionManifest(root, ['nested/a.txt', 'z.txt'])
    writeFileSync(join(root, 'z.txt'), 'changed\n')
    expect(() => verifyExtractionManifest(root, manifest)).toThrow('hash mismatch')
    rmSync(join(root, 'z.txt'))
    expect(() => verifyExtractionManifest(root, manifest)).toThrow('missing extracted file')
  })

  it('rejects a symlink that escapes the packaging root', () => {
    const root = fixture()
    symlinkSync('/tmp', join(root, 'escape'))
    expect(() => buildExtractionManifest(root, ['escape'])).toThrow('must be a regular file')
  })
})
