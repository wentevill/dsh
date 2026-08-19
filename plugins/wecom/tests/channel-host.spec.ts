import { describe, expect, it, vi } from 'vitest'
import { createWeComChannelHost, WECOM_BOT_ID, WECOM_BOT_SECRET } from '../src/channel-host.js'

function setup() {
  const credentials = new Map<string, string>()
  const records = new Map()
  const order: string[] = []
  const domain = {
    table: () => ({
      get: (key: string) => records.get(key), put: async (key: string, value: unknown) => { records.set(key, value) },
      update: async (key: string, fn: (value: unknown) => unknown) => { const next = fn(records.get(key)); records.set(key, next); return next },
    }),
    close: vi.fn(async () => { order.push('domain.close') }),
  }
  const listeners: Array<(ref: string) => void> = []
  const ctx = {
    storageDomain: { open: vi.fn(async () => domain) },
    credentials: {
      resolve: vi.fn(async (ref: string) => credentials.has(ref) ? { value: credentials.get(ref), source: 'test' } : undefined),
      set: vi.fn(async (ref: string, value: string) => { credentials.set(ref, value); listeners.forEach(fn => fn(ref)) }),
      unset: vi.fn(async (ref: string) => { credentials.delete(ref); listeners.forEach(fn => fn(ref)) }),
    },
    on: vi.fn((_event: string, listener: (ref: string) => void) => { listeners.push(listener); return () => listeners.splice(listeners.indexOf(listener), 1) }),
    sessions: { get: vi.fn(), flush: vi.fn(async () => {}) },
    sessionPersistence: { list: vi.fn(async () => []) },
    agents: { get: vi.fn() },
    agentDefaultModel: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
    attachments: { saveImages: vi.fn(async () => []) },
    get: vi.fn(() => undefined),
  }
  const controller = {
    start: vi.fn(async () => { order.push('channel.start') }),
    stop: vi.fn(async () => { order.push('channel.stop') }),
    snapshot: () => ({ state: 'stopped' as const, attempt: 0 }),
    subscribe: vi.fn(() => () => {}),
  }
  const cli = {
    status: vi.fn(), connect: vi.fn(),
    provision: vi.fn(async () => { order.push('cli.provision') }),
    deleteOwnedAuthorization: vi.fn(async () => { order.push('cli.delete') }),
  }
  const qr = { connect: vi.fn(async () => ({ botId: 'bot', secret: 'secret' })), cancel: vi.fn() }
  return { ctx, credentials, domain, controller, cli, qr, order }
}

describe('WeCom channel host lifecycle', () => {
  it('stores QR credentials, provisions CLI, then starts the channel', async () => {
    const s = setup()
    const host = await createWeComChannelHost(s.ctx as never, {
      cli: s.cli as never, qr: s.qr, createController: (() => s.controller) as never,
    })
    await host.authBackend.connect({ signal: new AbortController().signal, onQr() {} })
    expect(s.credentials.get(WECOM_BOT_ID)).toBe('bot')
    expect(s.credentials.get(WECOM_BOT_SECRET)).toBe('secret')
    expect(s.order).toEqual(['cli.provision', 'channel.start'])
    await host.dispose()
  })

  it('stops before credential deletion and retains room mappings', async () => {
    const s = setup()
    const host = await createWeComChannelHost(s.ctx as never, {
      cli: s.cli as never, qr: s.qr, createController: (() => s.controller) as never,
    })
    await host.authBackend.connect({ signal: new AbortController().signal, onQr() {} })
    s.order.length = 0
    await host.authBackend.deleteOwnedAuthorization()
    expect(s.order.slice(0, 2)).toEqual(['channel.stop', 'cli.delete'])
    expect(s.domain.close).not.toHaveBeenCalled()
    await host.dispose()
    expect(s.domain.close).toHaveBeenCalledTimes(1)
  })

  it('rolls credentials back when CLI provisioning fails', async () => {
    const s = setup()
    s.cli.provision.mockRejectedValueOnce(new Error('failed'))
    const host = await createWeComChannelHost(s.ctx as never, {
      cli: s.cli as never, qr: s.qr, createController: (() => s.controller) as never,
    })
    await expect(host.authBackend.connect({ signal: new AbortController().signal, onQr() {} })).rejects.toThrow('failed')
    expect(s.credentials.has(WECOM_BOT_ID)).toBe(false)
    expect(s.credentials.has(WECOM_BOT_SECRET)).toBe(false)
    await host.dispose()
  })
})
