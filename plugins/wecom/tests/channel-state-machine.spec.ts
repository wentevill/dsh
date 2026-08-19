import { describe, expect, it, vi } from 'vitest'
import { createChannelController } from '../src/channel-state-machine.js'
import type { SdkClient, SdkClientFactory, SdkEventMap } from '../src/channel-types.js'

class FakeClient implements SdkClient {
  connectCount = 0
  disconnectCount = 0
  listeners = new Map<keyof SdkEventMap, Set<(...args: any[]) => void>>()

  connect() { this.connectCount += 1 }
  disconnect() { this.disconnectCount += 1 }
  on<K extends keyof SdkEventMap>(event: K, listener: (...args: SdkEventMap[K]) => void) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
    return () => listeners.delete(listener)
  }
  emit<K extends keyof SdkEventMap>(event: K, ...args: SdkEventMap[K]) {
    for (const listener of this.listeners.get(event) ?? []) listener(...args)
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0)
  }
  async reply() {}
  async download() { return { buffer: new Uint8Array() } }
}

function setup() {
  vi.useFakeTimers()
  const clients: FakeClient[] = []
  const factory: SdkClientFactory = {
    create: () => {
      const client = new FakeClient()
      clients.push(client)
      return client
    },
  }
  let online: (() => void) | undefined
  const controller = createChannelController({
    factory,
    random: () => 0.5,
    subscribeNetworkRestored: listener => {
      online = listener
      return () => { online = undefined }
    },
  })
  return { controller, clients, restoreNetwork: () => online?.() }
}

describe('channel connection generations', () => {
  it('connects once and only authenticates into connected', async () => {
    const { controller, clients } = setup()
    const states: string[] = []
    controller.subscribe(snapshot => states.push(snapshot.state))

    await controller.start({ botId: 'bot', secret: 'redacted' })
    clients[0].emit('connected')
    clients[0].emit('authenticated')

    expect(clients[0].connectCount).toBe(1)
    expect(states).toEqual(['stopped', 'connecting', 'subscribing', 'connected'])
  })

  it('owns capped exponential reconnect delays', async () => {
    const { controller, clients } = setup()
    await controller.start({ botId: 'bot', secret: 'redacted' })

    const delays: number[] = []
    for (const expected of [1000, 2000, 4000, 8000, 15000, 30000]) {
      clients.at(-1)!.emit('disconnected', 'network')
      await Promise.resolve()
      delays.push(controller.snapshot().nextRetryAt! - Date.now())
      await vi.advanceTimersByTimeAsync(expected)
    }

    expect(delays).toEqual([1000, 2000, 4000, 8000, 15000, 30000])
    expect(clients).toHaveLength(7)
  })

  it('rejects stale events and replaces a prior generation on start', async () => {
    const { controller, clients } = setup()
    await controller.start({ botId: 'first', secret: 'one' })
    const stale = clients[0]
    await controller.start({ botId: 'second', secret: 'two' })
    stale.emit('authenticated')

    expect(stale.disconnectCount).toBe(1)
    expect(stale.listenerCount()).toBe(0)
    expect(controller.snapshot().state).toBe('connecting')
  })

  it('does not retry authentication failures', async () => {
    const { controller, clients } = setup()
    await controller.start({ botId: 'bot', secret: 'bad' })
    clients[0].emit('disconnected', 'authentication rejected')
    const error = Object.assign(new Error('invalid credentials'), { category: 'auth' })
    clients[0].emit('error', error)
    await vi.runAllTimersAsync()

    expect(controller.snapshot().state).toBe('auth_failed')
    expect(controller.snapshot().error?.message).not.toContain('bad')
    expect(clients).toHaveLength(1)
  })

  it('retries immediately when the network returns and resets after stability', async () => {
    const { controller, clients, restoreNetwork } = setup()
    await controller.start({ botId: 'bot', secret: 'redacted' })
    clients[0].emit('disconnected', 'network')
    await Promise.resolve()
    restoreNetwork()
    expect(clients).toHaveLength(2)

    clients[1].emit('connected')
    clients[1].emit('authenticated')
    await vi.advanceTimersByTimeAsync(30_000)
    clients[1].emit('disconnected', 'network')
    await Promise.resolve()
    expect(controller.snapshot().nextRetryAt! - Date.now()).toBe(1000)
  })

  it('stops with no client listeners or timers', async () => {
    const { controller, clients, restoreNetwork } = setup()
    await controller.start({ botId: 'bot', secret: 'redacted' })
    clients[0].emit('disconnected', 'network')
    await Promise.resolve()
    await controller.stop()
    restoreNetwork()
    await vi.runAllTimersAsync()

    expect(controller.snapshot().state).toBe('stopped')
    expect(clients[0].disconnectCount).toBe(1)
    expect(clients[0].listenerCount()).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(clients).toHaveLength(1)
  })

  it('aborts and joins message work before stop resolves', async () => {
    vi.useFakeTimers()
    const clients: FakeClient[] = []
    let finished = false
    const controller = createChannelController({
      factory: { create: () => { const client = new FakeClient(); clients.push(client); return client } },
      onMessage: async (_frame, signal) => {
        await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }))
        finished = true
      },
    })
    await controller.start({ botId: 'bot', secret: 'secret' })
    clients[0].emit('message', {})

    await controller.stop()

    expect(finished).toBe(true)
  })
})
