import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')

function pack(): string {
  const destination = mkdtempSync(resolve(tmpdir(), 'dsh-mail-pack-'))
  execFileSync('corepack', ['pnpm', '--dir', root, 'pack', '--pack-destination', destination])
  return resolve(destination, 'dsh-mail-plugin-0.1.0.tgz')
}

describe('published mail plugin', () => {
  it('declares plugin libraries as dependencies and DSH capabilities as peers', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      files?: string[]
      dsh?: { bundle?: { patch?: string } }
    }
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      '@deepseek-ai/schemastery',
      'imapflow',
      'mailparser',
      'nodemailer',
    ])
    expect(Object.keys(manifest.peerDependencies ?? {}).sort()).toEqual([
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-credentials',
      '@deepseek-ai/dsh-mail',
      '@deepseek-ai/dsh-settings',
      '@deepseek-ai/dsh-system-prompt',
      '@deepseek-ai/dsh-tools',
    ])
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.files).toEqual(expect.arrayContaining(['lib', 'cordis.patch.yml', 'LICENSE']))
    expect(manifest.files).not.toContain('src')
  })

  it('uses the endpoint secure boolean expected by the mail seam', () => {
    const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')
    expect(patch).toContain('secure: true')
    expect(patch).not.toContain('tls: implicit')
  })

  it('ships every declared runtime artifact in the production archive', () => {
    const archive = pack()
    const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n')
    expect(files).toEqual(expect.arrayContaining([
      'package/package.json',
      'package/lib/index.js',
      'package/lib/client.js',
      'package/cordis.patch.yml',
      'package/LICENSE',
    ]))
    expect(files.some(file => file.startsWith('package/src/'))).toBe(false)
  })
})
