import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('0.2 channel release contract', () => {
  it('ships every channel module and exact SDK version', async () => {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.version).toBe('0.2.3')
    expect(manifest.dependencies['@wecom/aibot-node-sdk']).toBe('1.0.7')
    const build = JSON.parse(await readFile(new URL('../tsconfig.build.json', import.meta.url), 'utf8'))
    expect(build.include).toEqual(expect.arrayContaining([
      'src/channel-host.ts', 'src/channel-state-machine.ts', 'src/sdk-adapter.ts',
      'src/room-session-domain.ts', 'src/room-session-store.ts', 'src/room-scheduler.ts',
      'src/harness-bridge.ts', 'src/qr-auth-manager.ts',
    ]))
  })
})
