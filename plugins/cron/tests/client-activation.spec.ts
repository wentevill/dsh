import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.tsx'

describe('Cron Client activation', () => {
  it('mounts Remote and exactly one keyed tool-row slot, then disposes child before Remote', async () => {
    const order: string[] = []
    const registrations: Array<Record<string, unknown>> = []
    const child = {
      remote: { cron: {} }, sessions: {},
      locale: { register: vi.fn(() => () => { order.push('locale:dispose') }) },
      effect(register: () => () => void) { register() },
      slots: {
        inject(name: string, register: () => unknown) {
          order.push(`inject:${name}`)
          expect(register()).toBeTypeOf('function')
        },
        register(options: Record<string, unknown>) {
          registrations.push(options)
          return () => { order.push(`slot:dispose:${String(options.name)}`) }
        },
      },
    }
    const feature = Object.assign(Promise.resolve(), {
      dispose: async () => { order.push('child:dispose') },
    })
    const ctx = {
      remote: { $mount: vi.fn(async () => () => { order.push('remote:dispose') }) },
      plugin: vi.fn((plugin: (context: typeof child) => unknown) => {
        plugin(child)
        return feature
      }),
    }

    const dispose = await apply(ctx as never)
    expect(registrations).toEqual([{
      name: 'tool.call.toolview', key: 'cron_open_manager', locale: 'cron',
    }])
    expect(registrations.flatMap(value => Object.values(value))).not.toContain('details')
    expect(registrations.flatMap(value => Object.values(value))).not.toContain('conversation.details.tool')
    expect(registrations.flatMap(value => Object.values(value))).not.toContain('conversation.view')

    await dispose()
    expect(order.slice(-2)).toEqual(['child:dispose', 'remote:dispose'])
  })
})
