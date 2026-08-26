import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('release package', () => {
  it('packs a self-contained manager without source or tests', () => {
    const destination = mkdtempSync(join(tmpdir(), 'plugin-manager-pack-'))
    roots.push(destination)
    execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', destination], {
      cwd: join(import.meta.dirname, '..'), stdio: 'ignore',
    })
    const archive = join(destination, readdirSync(destination).find(name => name.endsWith('.tgz'))!)
    const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).split('\n')
    expect(entries).toContain('package/lib/client.js')
    expect(entries).toContain('package/lib/typert.host.js')
    expect(entries.some(entry => entry.startsWith('package/node_modules/tar-stream/'))).toBe(true)
    expect(entries.some(entry => entry.startsWith('package/node_modules/semver/'))).toBe(true)
    expect(entries.some(entry => entry.startsWith('package/src/'))).toBe(false)
    expect(entries.some(entry => entry.startsWith('package/tests/'))).toBe(false)
  })
})
