import { describe, expect, it } from 'vitest'
import { createWeComAuthController, type AuthBackend, type WeComAuthSnapshot } from '../src/auth.ts'

function backend(overrides: Partial<AuthBackend> = {}): AuthBackend {
  return {
    status: async () => ({ authorized: false }),
    connect: async ({ onQr }) => { onQr('data:image/png;base64,cXI=') },
    deleteOwnedAuthorization: async () => {},
    ...overrides,
  }
}

describe('WeCom authorization controller', () => {
  it('starts unauthorized without exposing business tools', async () => {
    const controller = createWeComAuthController({ backend: backend(), refreshTools: async () => 0, clearTools: async () => {} })
    await controller.initialize()
    expect(controller.snapshot()).toEqual({ state: 'unauthorized' })
  })

  it('publishes the QR then becomes ready after authorization and schema refresh', async () => {
    let authorized = false
    const states: WeComAuthSnapshot[] = []
    const controller = createWeComAuthController({
      backend: backend({
        status: async () => authorized ? { authorized: true, botId: 'bot-1' } : { authorized: false },
        connect: async ({ onQr }) => {
          onQr('data:image/png;base64,cXI=')
          authorized = true
        },
      }),
      refreshTools: async () => 12,
      clearTools: async () => {},
    })
    controller.subscribe(state => { states.push(state) })

    await controller.connect()

    expect(states).toContainEqual({ state: 'awaiting_scan', qrDataUrl: 'data:image/png;base64,cXI=' })
    expect(controller.snapshot()).toEqual({ state: 'ready', botId: 'bot-1', toolCount: 12 })
  })

  it('keeps authorization when schema synchronization fails', async () => {
    const controller = createWeComAuthController({
      backend: backend({ status: async () => ({ authorized: true, botId: 'bot-1' }) }),
      refreshTools: async () => { throw new Error('offline') },
      clearTools: async () => {},
    })

    await controller.initialize()
    expect(controller.snapshot()).toEqual({ state: 'sync_failed', botId: 'bot-1', message: 'offline' })
  })

  it('cancels an active QR authorization', async () => {
    let aborted = false
    const controller = createWeComAuthController({
      backend: backend({
        connect: ({ signal, onQr }) => new Promise<void>((_resolve, reject) => {
          onQr('data:image/png;base64,cXI=')
          signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) }, { once: true })
        }),
      }),
      refreshTools: async () => 0,
      clearTools: async () => {},
    })

    const pending = controller.connect()
    controller.cancel()
    await pending
    expect(aborted).toBe(true)
    expect(controller.snapshot()).toEqual({ state: 'unauthorized' })
  })

  it('clears tools and owned authorization after confirmation', async () => {
    const effects: string[] = []
    const controller = createWeComAuthController({
      backend: backend({
        status: async () => ({ authorized: true, botId: 'bot-1' }),
        deleteOwnedAuthorization: async () => { effects.push('delete') },
      }),
      refreshTools: async () => 4,
      clearTools: async () => { effects.push('clear') },
    })
    await controller.initialize()

    await controller.deleteAuthorization(true)

    expect(effects).toEqual(['clear', 'delete'])
    expect(controller.snapshot()).toEqual({ state: 'unauthorized' })
  })

  it('refuses deletion without explicit confirmation', async () => {
    const controller = createWeComAuthController({ backend: backend(), refreshTools: async () => 0, clearTools: async () => {} })
    await expect(controller.deleteAuthorization(false)).rejects.toThrow('confirmation required')
  })
})
