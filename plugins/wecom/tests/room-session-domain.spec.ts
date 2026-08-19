import { describe, expect, it } from 'vitest'
import { roomRecordSchema, wecomRoomSessionsSpec } from '../src/room-session-domain.js'

describe('wecom room session domain', () => {
  it('declares one versioned rooms table with strict durable records', () => {
    expect(wecomRoomSessionsSpec.name).toBe('wecom_room_sessions')
    expect(wecomRoomSessionsSpec.version).toBe(1)
    expect(roomRecordSchema.safeParse({
      botDigest: 'abc', kind: 'group', sessionId: 'session', createdAt: 1, lastUsedAt: 2,
    }).success).toBe(true)
    expect(roomRecordSchema.safeParse({
      botDigest: 'abc', kind: 'bad', sessionId: 'session', createdAt: -1, lastUsedAt: 2,
    }).success).toBe(false)
  })
})
