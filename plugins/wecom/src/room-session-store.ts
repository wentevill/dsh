import { createHmac } from 'node:crypto'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { BotDigest, RoomDigest, RoomRecord } from './room-session-domain.js'

export interface RoomIdentity {
  readonly botId: string
  readonly kind: 'direct' | 'group'
  readonly id: string
}

export interface RoomSessionStoreOptions {
  readonly table: KvTable<RoomDigest, RoomRecord>
  readonly salt: Uint8Array
  readonly sessionExists: (id: SessionId) => Promise<boolean>
  readonly createSessionId: () => Promise<SessionId>
  readonly now?: () => number
}

export class RoomSessionStore {
  readonly #pending = new Map<RoomDigest, Promise<SessionId>>()
  readonly #table: KvTable<RoomDigest, RoomRecord>
  readonly #salt: Uint8Array
  readonly #sessionExists: (id: SessionId) => Promise<boolean>
  readonly #createSessionId: () => Promise<SessionId>
  readonly #now: () => number
  #closed = false
  #closing?: Promise<void>

  constructor(options: RoomSessionStoreOptions) {
    this.#table = options.table
    this.#salt = new Uint8Array(options.salt)
    this.#sessionExists = options.sessionExists
    this.#createSessionId = options.createSessionId
    this.#now = options.now ?? Date.now
    if (this.#salt.byteLength < 16) throw new TypeError('room-key salt must contain at least 16 bytes')
  }

  resolve(room: RoomIdentity): Promise<SessionId> {
    if (this.#closed) return Promise.reject(new Error('room session store is closed'))
    const key = this.#roomDigest(room)
    const existing = this.#pending.get(key)
    if (existing) return existing
    const operation = this.#resolve(key, room)
    this.#pending.set(key, operation)
    void operation.finally(() => this.#pending.delete(key)).catch(() => {})
    return operation
  }

  close(): Promise<void> {
    this.#closed = true
    this.#closing ??= Promise.allSettled([...this.#pending.values()]).then(() => undefined)
    return this.#closing
  }

  async #resolve(key: RoomDigest, room: RoomIdentity): Promise<SessionId> {
    const record = this.#table.get(key)
    const now = this.#now()
    if (record && await this.#sessionExists(record.sessionId)) {
      if (record.lastUsedAt !== now) {
        await this.#table.update(key, current => ({ ...current, lastUsedAt: now }))
      }
      return record.sessionId
    }

    const sessionId = await this.#createSessionId()
    const replacement: RoomRecord = {
      botDigest: this.#digest(`bot\0${room.botId}`) as BotDigest,
      kind: room.kind,
      sessionId,
      createdAt: now,
      lastUsedAt: now,
    }
    await this.#table.put(key, replacement)
    return sessionId
  }

  #roomDigest(room: RoomIdentity): RoomDigest {
    return this.#digest(`room\0${room.botId}\0${room.kind}\0${room.id}`) as RoomDigest
  }

  #digest(value: string): string {
    return createHmac('sha256', this.#salt).update(value, 'utf8').digest('base64url')
  }
}
