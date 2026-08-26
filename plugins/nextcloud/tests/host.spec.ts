import { describe, expect, it, vi } from 'vitest'
import { createServiceResolver } from '../src/host.ts'
import type { NextcloudSettings } from '../src/settings.ts'

const settings: NextcloudSettings = {
  serverUrl: 'https://cloud.example.com', username: 'alice', accessMode: 'all', allowedRoots: [],
  allowDelete: false, allowHttp: false, skipTlsVerify: false,
}

describe('Nextcloud Host service resolver', () => {
  it('resolves the application password per operation and exposes only a hash fingerprint', async () => {
    const credentials = { resolve: vi.fn(async () => ({ value: 'sentinel-app-password', source: 'file' })) }
    const transportFactory = vi.fn(() => ({}) as never)
    const resolve = createServiceResolver({ get: () => settings } as never, credentials as never, transportFactory)
    const first = await resolve()
    const second = await resolve()
    expect(credentials.resolve).toHaveBeenCalledTimes(2)
    expect(transportFactory).toHaveBeenCalledWith(expect.objectContaining({ username: 'alice' }), 'sentinel-app-password')
    expect(first.fingerprint).toBe(second.fingerprint)
    expect(first.fingerprint).not.toContain('sentinel-app-password')
  })

  it('rejects missing account settings and credentials without opening a transport', async () => {
    const transportFactory = vi.fn()
    const empty = { ...settings, serverUrl: '', username: '' }
    await expect(createServiceResolver({ get: () => empty } as never, { resolve: vi.fn() } as never, transportFactory)()).rejects.toThrow(/not configured/u)
    await expect(createServiceResolver({ get: () => settings } as never, { resolve: vi.fn(async () => undefined) } as never, transportFactory)()).rejects.toThrow(/application password/u)
    expect(transportFactory).not.toHaveBeenCalled()
  })
})
