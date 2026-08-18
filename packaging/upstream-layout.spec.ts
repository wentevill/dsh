import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { ARCHIVE_REF, assertMigrationSource } from './upstream-layout.ts'

const fixtures: string[] = []

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function fixture(): { root: string; base: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-packaging-source-'))
  fixtures.push(root)
  git(root, 'init', '-b', 'master')
  git(root, 'config', 'user.email', 'fixture@example.invalid')
  git(root, 'config', 'user.name', 'Fixture')
  writeFileSync(join(root, 'README.md'), 'upstream\n')
  git(root, 'add', 'README.md')
  git(root, 'commit', '-m', 'upstream')
  const base = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', 'refs/remotes/origin/master', base)
  writeFileSync(join(root, 'packaging.txt'), 'private\n')
  git(root, 'add', 'packaging.txt')
  git(root, 'commit', '-m', 'packaging')
  const head = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', ARCHIVE_REF, head)
  return { root, base, head }
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('assertMigrationSource', () => {
  it('accepts the exact archived packaging head over a clean upstream base', () => {
    const value = fixture()
    expect(assertMigrationSource(value.root, { expectedHead: value.head, expectedArchive: value.head })).toEqual({
      head: value.head,
      upstreamHead: value.base,
    })
  })

  it('rejects a dirty checkout before migration', () => {
    const value = fixture()
    writeFileSync(join(value.root, 'README.md'), 'dirty\n')
    expect(() => assertMigrationSource(value.root, { expectedHead: value.head, expectedArchive: value.head }))
      .toThrow('working tree is not clean')
  })

  it('rejects an archive ref that does not preserve the packaging head', () => {
    const value = fixture()
    git(value.root, 'update-ref', ARCHIVE_REF, value.base)
    expect(() => assertMigrationSource(value.root, { expectedHead: value.head, expectedArchive: value.head }))
      .toThrow(ARCHIVE_REF)
  })

  it('rejects a source checkout at an unexpected current commit', () => {
    const value = fixture()
    expect(() => assertMigrationSource(value.root, { expectedHead: value.base, expectedArchive: value.head }))
      .toThrow('expected migration commit')
  })
})
