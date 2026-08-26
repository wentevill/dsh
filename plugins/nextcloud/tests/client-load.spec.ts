import { describe, expect, it, vi } from 'vitest'
import { loadNextcloudCardSettings } from '../src/client/index.tsx'

describe('Nextcloud card settings load', () => {
  it('turns the single Host load result into the card initial value', async () => {
    const settings = { serverUrl: 'https://cloud.example.com', username: 'alice', accessMode: 'all', allowedRoots: [], allowDelete: false, allowHttp: false, skipTlsVerify: false }
    const load = vi.fn(async () => ({ ok: true as const, value: { settings } }))
    expect(await loadNextcloudCardSettings({ load })).toEqual(settings)
    expect(load).toHaveBeenCalledTimes(1)
  })
})
