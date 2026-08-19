import { describe, expect, it } from 'vitest'
import { createDynamicToolCatalog, type DynamicToolDefinition } from '../src/catalog.ts'
import type { DiscoveredMethod } from '../src/discovery.ts'

const method = (path: string): DiscoveredMethod => ({
  path: path.split('.'),
  description: path,
  requestRef: 'Req',
  responseRef: 'Res',
  schemas: {
    Req: { type: 'object', properties: {} },
    Res: { type: 'object', properties: {} },
  },
})

describe('dynamic WeCom tool catalog', () => {
  it('installs a complete adapted generation and disposes the previous one afterwards', async () => {
    const events: string[] = []
    const generations: DynamicToolDefinition[][] = []
    const catalog = createDynamicToolCatalog({
      install(definitions) {
        generations.push([...definitions])
        const generation = generations.length
        events.push(`install:${generation}`)
        return () => { events.push(`dispose:${generation}`) }
      },
    })

    await expect(catalog.refresh([method('message.aibot.sessions.list')])).resolves.toBe(1)
    await expect(catalog.refresh([method('contact.users.search')])).resolves.toBe(1)

    expect(generations.map(items => items.map(item => item.name))).toEqual([
      ['wecom_message_aibot_sessions_list'],
      ['wecom_contact_users_search'],
    ])
    expect(events).toEqual(['install:1', 'install:2', 'dispose:1'])
  })

  it('retains the last good generation when candidate adaptation fails', async () => {
    const events: string[] = []
    const catalog = createDynamicToolCatalog({
      install() { events.push('install'); return () => { events.push('dispose') } },
    })
    await catalog.refresh([method('todo.list')])
    const unsupported: DiscoveredMethod = {
      ...method('todo.create'),
      schemas: {
        Req: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        Res: { type: 'object' },
      },
    }

    await expect(catalog.refresh([unsupported])).rejects.toThrow('unsupported oneOf')
    expect(events).toEqual(['install'])
  })

  it('rejects normalized name collisions before installation', async () => {
    let installs = 0
    const catalog = createDynamicToolCatalog({ install() { installs += 1; return () => {} } })
    await expect(catalog.refresh([
      method('doc.foo-bar.get'),
      method('doc.foo_bar.get'),
    ])).rejects.toThrow('duplicate WeCom tool name')
    expect(installs).toBe(0)
  })

  it('clears the active generation', async () => {
    let disposed = 0
    const catalog = createDynamicToolCatalog({ install() { return () => { disposed += 1 } } })
    await catalog.refresh([method('todo.list')])
    await catalog.clear()
    expect(disposed).toBe(1)
    expect(catalog.size()).toBe(0)
  })
})
