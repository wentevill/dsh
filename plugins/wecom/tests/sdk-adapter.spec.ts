import { describe, expect, it, vi } from 'vitest'
import { createSdkClientFactory } from '../src/sdk-adapter.js'

class FakeOfficialClient {
  static instances: FakeOfficialClient[] = []
  readonly handlers = new Map<string, Set<(...args: any[]) => void>>()
  readonly replyStream = vi.fn(async () => ({}))
  readonly downloadFile = vi.fn(async () => ({ buffer: Buffer.from('file'), filename: 'a.txt' }))
  readonly options: Record<string, unknown>
  connectCount = 0
  disconnectCount = 0

  constructor(options: Record<string, unknown>) {
    this.options = options
    FakeOfficialClient.instances.push(this)
  }
  connect() { this.connectCount += 1; return this }
  disconnect() { this.disconnectCount += 1 }
  on(event: string, listener: (...args: any[]) => void) {
    const handlers = this.handlers.get(event) ?? new Set()
    handlers.add(listener)
    this.handlers.set(event, handlers)
    return this
  }
  off(event: string, listener: (...args: any[]) => void) {
    this.handlers.get(event)?.delete(listener)
    return this
  }
}

describe('official SDK adapter', () => {
  it('disables SDK reconnect and removes event handlers through disposers', () => {
    const factory = createSdkClientFactory({ Client: FakeOfficialClient as never })
    const client = factory.create({ botId: 'bot', secret: 'never-log-this' })
    const official = FakeOfficialClient.instances.at(-1)!
    const dispose = client.on('connected', () => {})

    expect(official.options).toMatchObject({
      botId: 'bot',
      maxReconnectAttempts: 0,
      maxAuthFailureAttempts: 0,
    })
    expect(official.handlers.get('connected')?.size).toBe(1)
    dispose()
    expect(official.handlers.get('connected')?.size).toBe(0)
  })

  it('replies through the exact callback frame', async () => {
    const factory = createSdkClientFactory({ Client: FakeOfficialClient as never })
    const client = factory.create({ botId: 'bot', secret: 'secret' })
    const official = FakeOfficialClient.instances.at(-1)!
    const frame = { headers: { req_id: 'request-1' } }

    await client.reply(frame, 'stream-1', 'answer', true)

    expect(official.replyStream).toHaveBeenCalledWith(frame, 'stream-1', 'answer', true)
  })

  it('projects downloads without exposing the SDK Buffer type', async () => {
    const factory = createSdkClientFactory({ Client: FakeOfficialClient as never })
    const client = factory.create({ botId: 'bot', secret: 'secret' })
    const result = await client.download('https://example.invalid/file', 'aes')
    expect(result).toEqual({ buffer: new Uint8Array(Buffer.from('file')), filename: 'a.txt' })
  })

  it('redacts and categorizes SDK errors before publishing them', () => {
    const factory = createSdkClientFactory({ Client: FakeOfficialClient as never })
    const client = factory.create({ botId: 'bot', secret: 'secret-value' })
    const official = FakeOfficialClient.instances.at(-1)!
    let projected: Error | undefined
    client.on('error', error => { projected = error })

    for (const handler of official.handlers.get('error') ?? []) {
      handler(Object.assign(new Error('secret-value'), { category: 'auth' }))
    }

    expect(projected).toMatchObject({ category: 'auth', message: 'WeCom Bot authentication failed' })
    expect(projected?.message).not.toContain('secret-value')
  })
})
