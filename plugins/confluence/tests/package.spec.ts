import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const roots: string[] = []
afterEach(() => { for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true }) })

describe('published Confluence plugin', () => {
  it('publishes the upstream credential compatibility fix as version 0.1.1', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }
    expect(manifest.version).toBe('0.1.1')
  })

  it('packs the Host, browser client, Typert faces, docs, and patch', () => {
    const destination = mkdtempSync(join(tmpdir(), 'dsh-confluence-pack-'))
    roots.push(destination)
    execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', destination], { cwd: root, stdio: 'pipe' })
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string }
    const archive = join(destination, `dsh-confluence-${manifest.version}.tgz`)
    const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
    expect(files).toEqual(expect.arrayContaining([
      'package/lib/index.js', 'package/lib/index.d.ts', 'package/lib/client.js',
      'package/lib/typert.host.js', 'package/lib/typert.remote-client.js',
      'package/cordis.patch.yml', 'package/README.md', 'package/LICENSE',
      'package/node_modules/@deepseek-ai/schemastery/package.json',
      'package/node_modules/html-to-text/package.json',
      'package/node_modules/markdown-it/package.json', 'package/node_modules/zod/package.json',
    ]))
    expect(files.some(file => file.startsWith('package/src/') || file.startsWith('package/tests/'))).toBe(false)
    execFileSync('tar', ['-xzf', archive], { cwd: destination })
    execFileSync(process.execPath, ['--input-type=module', '--eval', "await import('./package/lib/content.js')"], { cwd: destination })
  }, 30_000)
})
