import { describe, expect, it, vi } from 'vitest'
import { QrAuthError, createQrAuthManager } from '../src/qr-auth-manager.js'

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

describe('WeCom QR auth manager', () => {
  it('generates a fresh QR and returns complete bot credentials', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ data: { scode: 'scan-code', auth_url: 'https://work.weixin.qq.com/qr' } }))
      .mockResolvedValueOnce(response({ data: { status: 'waiting' } }))
      .mockResolvedValueOnce(response({ data: { status: 'success', bot_info: { botid: 'bot-id', secret: 'bot-secret' } } }))
    const qr: string[] = []
    const manager = createQrAuthManager({ fetch, toQrDataUrl: async value => `data:${value}`, pollIntervalMs: 0 })
    const credentials = await manager.connect({ signal: new AbortController().signal, onQr: value => qr.push(value) })

    expect(credentials).toEqual({ botId: 'bot-id', secret: 'bot-secret' })
    expect(qr).toEqual(['data:https://work.weixin.qq.com/qr'])
    expect(fetch.mock.calls[0][0].toString()).toContain('/ai/qc/generate?source=dsh-wecom&plat=0')
    expect(fetch.mock.calls[1][0].toString()).toContain('/ai/qc/query_result?scode=scan-code')
  })

  it('rejects incomplete success and upstream failures without secret leakage', async () => {
    const incomplete = createQrAuthManager({
      fetch: vi.fn()
        .mockResolvedValueOnce(response({ data: { scode: 'code', auth_url: 'url' } }))
        .mockResolvedValueOnce(response({ data: { status: 'success', bot_info: { botid: 'bot', secret: '' } } })),
      toQrDataUrl: async () => 'qr', pollIntervalMs: 0,
    })
    const error = await incomplete.connect({ signal: new AbortController().signal, onQr() {} }).catch(value => value)
    expect(error).toBeInstanceOf(QrAuthError)
    expect(error.message).not.toContain('bot')

    const failed = createQrAuthManager({ fetch: vi.fn().mockResolvedValue(response({ error: 'private' }, 500)), toQrDataUrl: async () => 'qr' })
    await expect(failed.connect({ signal: new AbortController().signal, onQr() {} }))
      .rejects.toMatchObject({ code: 'upstream' })
  })

  it('cancels, expires, and replaces the prior authorization generation', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(async (url: URL, init?: RequestInit) => {
      if (url.pathname.endsWith('/generate')) return response({ data: { scode: Math.random().toString(), auth_url: 'url' } })
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
    })
    const manager = createQrAuthManager({ fetch, toQrDataUrl: async () => 'qr', pollIntervalMs: 100, ttlMs: 500 })
    const first = manager.connect({ signal: new AbortController().signal, onQr() {} })
    const firstAssertion = expect(first).rejects.toMatchObject({ code: 'cancelled' })
    await vi.advanceTimersByTimeAsync(100)
    const second = manager.connect({ signal: new AbortController().signal, onQr() {} })
    const secondAssertion = expect(second).rejects.toMatchObject({ code: 'cancelled' })
    await firstAssertion
    manager.cancel()
    await vi.advanceTimersByTimeAsync(100)
    await secondAssertion
    expect(vi.getTimerCount()).toBe(0)
  })
})
