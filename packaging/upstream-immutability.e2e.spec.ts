import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createAssemblySource } from '../apps/desktop/scripts/stage-runtime.ts'
import { captureUpstreamState } from './assert-upstream.ts'

describe('Desktop upstream assembly', () => {
  it('exports tracked GitHub source without changing its checkout', () => {
    const root = resolve(import.meta.dirname, '..')
    const before = captureUpstreamState(root)
    const destination = join(mkdtempSync(join(tmpdir(), 'dsh-upstream-assembly-')), 'source')

    createAssemblySource(join(root, 'upstream'), destination)

    expect(JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'))).toHaveProperty('name')
    expect(() => readFileSync(join(destination, '.git/config'))).toThrow()
    expect(captureUpstreamState(root)).toEqual(before)
  })
})
