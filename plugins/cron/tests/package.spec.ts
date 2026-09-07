import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const pluginRoot = resolve(import.meta.dirname, '..')

describe('standalone Cron plugin manifest', () => {
  it('publishes independent Host, Client, and Remote entry points', () => {
    const manifest = JSON.parse(readFileSync(resolve(pluginRoot, 'package.json'), 'utf8')) as {
      name: string
      version: string
      engines: { node: string }
      exports: Record<string, unknown>
      files: string[]
      bundledDependencies: string[]
      dsh: { bundle: { patch: string }; client: { platform: string } }
    }

    expect(manifest).toMatchObject({
      name: 'dsh-cron', version: '0.1.0', engines: { node: '>=24' },
      files: ['lib', 'cordis.patch.yml', 'README.md', 'LICENSE'],
      bundledDependencies: ['node-cron', 'zod'],
      dsh: { bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web' } },
    })
    expect(Object.keys(manifest.exports)).toEqual([
      '.', './client', './remote-types', './package.json',
    ])
  })

})
