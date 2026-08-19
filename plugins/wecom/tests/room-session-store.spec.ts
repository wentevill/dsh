import { describe, expect, it, vi } from 'vitest'
import { RoomSessionStore } from '../src/room-session-store.js'
import type { RoomDigest, RoomRecord } from '../src/room-session-domain.js'

class MemoryTable {
  readonly records = new Map<RoomDigest, RoomRecord>()
  readonly put = vi.fn(async (key: RoomDigest, value: RoomRecord) => { this.records.set(key, value) })
  get(key: RoomDigest) { return this.records.get(key) }
  async update(key: RoomDigest, transform: (value: RoomRecord) => RoomRecord) {
    const current = this.records.get(key)
    if (!current) throw new Error('missing')
    const next = transform(current)
    await this.put(key, next)
    return next
  }
}

const group = { botId: 'bot-raw', kind: 'group' as const, id: 'room-raw' }

function setup(table = new MemoryTable()) {
  let sequence = 0
  const sessions = new Set<string>()
  const store = new RoomSessionStore({
    table: table as never,
    salt: new Uint8Array(Buffer.from('local-secret-salt')),
    now: () => 100,
    sessionExists: async id => sessions.has(id),
    createSessionId: async () => { const id = `session-${++sequence}`; sessions.add(id); return id as never },
  })
  return { store, table, sessions }
}

describe('RoomSessionStore', () => {
  it('creates durably, reuses, and never stores raw room identities', async () => {
    const { store, table } = setup()
    const first = await store.resolve(group)
    const second = await store.resolve(group)
    expect(first).toBe('session-1')
    expect(second).toBe(first)
    const serialized = JSON.stringify([...table.records])
    expect(serialized).not.toContain('bot-raw')
    expect(serialized).not.toContain('room-raw')
    expect(table.put).toHaveBeenCalled()
  })

  it('isolates bot, room kind, and room id with stable HMAC keys', async () => {
    const { store, table } = setup()
    await store.resolve(group)
    await store.resolve({ ...group, botId: 'other' })
    await store.resolve({ ...group, kind: 'direct' })
    await store.resolve({ ...group, id: 'other' })
    expect(new Set(table.records.keys()).size).toBe(4)
  })

  it('serializes concurrent first messages and replaces stale sessions', async () => {
    const { store, table, sessions } = setup()
    const values = await Promise.all([store.resolve(group), store.resolve(group), store.resolve(group)])
    expect(new Set(values)).toEqual(new Set(['session-1']))
    sessions.delete('session-1')
    expect(await store.resolve(group)).toBe('session-2')
    expect(table.records.size).toBe(1)
  })

  it('does not publish a new mapping before its durable write', async () => {
    const table = new MemoryTable()
    let release!: () => void
    table.put.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve }) })
    const { store } = setup(table)
    let settled = false
    const pending = store.resolve(group).then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await pending
    expect(settled).toBe(true)
  })

  it('rejects failed writes, survives reopen, and closes idempotently', async () => {
    const table = new MemoryTable()
    const first = setup(table)
    const session = await first.store.resolve(group)
    const reopened = setup(table)
    reopened.sessions.add(session)
    expect(await reopened.store.resolve(group)).toBe(session)
    await reopened.store.close()
    await reopened.store.close()
    await expect(reopened.store.resolve(group)).rejects.toThrow(/closed/)

    const failing = setup(new MemoryTable())
    failing.table.put.mockRejectedValueOnce(new Error('durability failed'))
    await expect(failing.store.resolve(group)).rejects.toThrow('durability failed')
  })
})
