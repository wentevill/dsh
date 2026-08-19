import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const pluginRoot = fileURLToPath(new URL('..', import.meta.url))

describe('WebSocket channel package contract', () => {
  it('pins the official SDK and declares every host capability it consumes', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }

    expect(manifest.dependencies?.['@wecom/aibot-node-sdk']).toBe('1.0.7')
    expect(Object.keys(manifest.peerDependencies ?? {})).toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-credentials',
      '@deepseek-ai/dsh-storage-domain',
      '@deepseek-ai/dsh-session-persistence',
      '@deepseek-ai/dsh-agent-default-model',
      '@deepseek-ai/dsh-agent-presets',
      '@deepseek-ai/dsh-attachment',
      '@deepseek-ai/dsh-llm',
    ]))
  })

  it('injects the matching services and never exposes a secret configuration field', async () => {
    const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
    for (const service of [
      'agents',
      'sessions',
      'credentials',
      'storageDomain',
      'sessionPersistence',
      'agentDefaultModel',
      'attachments',
    ]) {
      expect(patch).toMatch(new RegExp(`\\b${service}\\b`))
    }
    expect(patch).not.toMatch(/botSecret|WECOM_BOT_SECRET|\bsecret\s*:/i)
  })

  it('keeps runtime contracts in the host build', async () => {
    const config = JSON.parse(
      await readFile(new URL('../tsconfig.build.json', import.meta.url), 'utf8'),
    ) as { include?: string[] }
    expect(config.include).toContain('src/channel-types.ts')
    expect(pluginRoot).toContain('plugins/wecom')
  })
})
