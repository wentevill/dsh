import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assertUpstream, captureUpstreamState } from './assert-upstream.ts'

const fixtures: string[] = []
const REMOTE = 'git@github.com:deepseek-ai/deepseek-harness.git'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function fixture(): { root: string; source: string; revision: string } {
  const root = mkdtempSync(join(tmpdir(), 'dsh-upstream-guard-'))
  fixtures.push(root)
  const source = join(root, 'deepseek-harness-source')
  mkdirSync(source)
  git(source, 'init', '-b', 'master')
  git(source, 'config', 'user.email', 'fixture@example.invalid')
  git(source, 'config', 'user.name', 'Fixture')
  writeFileSync(join(source, 'README.md'), 'upstream\n')
  git(source, 'add', 'README.md')
  git(source, 'commit', '-m', 'upstream')
  git(source, 'remote', 'add', 'origin', REMOTE)
  const revision = git(source, 'rev-parse', 'HEAD')
  symlinkSync('deepseek-harness-source', join(root, 'upstream'))
  writeFileSync(join(root, 'upstream.lock.json'), `${JSON.stringify({ remote: REMOTE, revision }, undefined, 2)}\n`)
  return { root, source, revision }
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('assertUpstream', () => {
  it('accepts a clean checkout at the locked revision and remote', () => {
    const value = fixture()
    const before = captureUpstreamState(value.root)
    expect(() => assertUpstream(value.root)).not.toThrow()
    expect(captureUpstreamState(value.root)).toEqual(before)
  })

  it('rejects a normal directory in place of the upstream symlink', () => {
    const value = fixture()
    unlinkSync(join(value.root, 'upstream'))
    mkdirSync(join(value.root, 'upstream'))
    expect(() => assertUpstream(value.root)).toThrow('must be a symlink')
  })

  it('rejects an upstream symlink that escapes the packaging root', () => {
    const value = fixture()
    unlinkSync(join(value.root, 'upstream'))
    symlinkSync('/tmp', join(value.root, 'upstream'))
    expect(() => assertUpstream(value.root)).toThrow('escapes packaging root')
  })

  it('rejects a dirty upstream checkout', () => {
    const value = fixture()
    writeFileSync(join(value.source, 'README.md'), 'dirty\n')
    expect(() => assertUpstream(value.root)).toThrow('working tree is not clean')
  })

  it('rejects a revision mismatch', () => {
    const value = fixture()
    writeFileSync(join(value.root, 'upstream.lock.json'), `${JSON.stringify({ remote: REMOTE, revision: '0'.repeat(40) })}\n`)
    expect(() => assertUpstream(value.root)).toThrow('revision mismatch')
  })

  it('rejects a remote mismatch', () => {
    const value = fixture()
    git(value.source, 'remote', 'set-url', 'origin', 'git@example.invalid:wrong/repo.git')
    expect(() => assertUpstream(value.root)).toThrow('remote mismatch')
  })
})
