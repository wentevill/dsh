import { describe, expect, it } from 'vitest'
import { loadNextcloudSettings, saveNextcloudSettings } from '../src/remote-settings.ts'
import type { NextcloudSettings } from '../src/settings.ts'

const configured: NextcloudSettings = {
  serverUrl: 'https://cloud.example.com', username: 'alice', accessMode: 'allowlist', allowedRoots: ['/AI'],
  allowDelete: false, allowHttp: false, skipTlsVerify: false,
}

describe('Nextcloud Host settings boundary', () => {
  it('loads the authoritative settings section', () => {
    expect(loadNextcloudSettings({ get: () => configured } as never)).toEqual({ settings: configured })
  })

  it('normalizes roots before committing a complete settings replacement', async () => {
    let durable = configured
    const scope = { get: () => durable, replace: async (value: NextcloudSettings) => { durable = value } }
    await expect(saveNextcloudSettings(scope as never, { settings: { ...configured, allowedRoots: ['/AI/', '/AI'] } }))
      .resolves.toEqual({ settings: configured })
  })

  it('allows a fully unconfigured account but rejects a half-configured account', async () => {
    let replacements = 0
    const scope = { get: () => configured, replace: async () => { replacements += 1 } }
    const empty = { ...configured, serverUrl: '', username: '', accessMode: 'all' as const, allowedRoots: [] }
    await expect(saveNextcloudSettings(scope as never, { settings: empty })).resolves.toEqual({ settings: configured })
    await expect(saveNextcloudSettings(scope as never, { settings: { ...empty, username: 'alice' } })).rejects.toThrow(/both server URL and username/u)
    expect(replacements).toBe(1)
  })
})
