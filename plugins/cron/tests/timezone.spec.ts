import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { timezoneForOpenTurn } from '../src/timezone.ts'

function events(...values: unknown[]): readonly SessionEvent[] {
  return values as readonly SessionEvent[]
}

function rpc(zone?: string) {
  return {
    type: 'user/message', seq: 1, time: 1,
    data: {
      id: 'message-1', role: 'user', content: [],
      source: { kind: 'user', rpcId: 'request-1', ...(zone === undefined ? {} : { clientTimeZone: zone }) },
    },
  }
}

describe('timezoneForOpenTurn', () => {
  it('returns the one canonical browser zone agreed by current RPC messages', () => {
    expect(timezoneForOpenTurn(events(rpc('Asia/Shanghai'), rpc('Asia/Shanghai'))))
      .toBe('Asia/Shanghai')
  })

  it.each([
    ['alias', 'US/Eastern'],
    ['malformed', 'No/Such_Zone'],
  ])('rejects a %s timezone', (_label, zone) => {
    expect(() => timezoneForOpenTurn(events(rpc(zone))))
      .toThrow(expect.objectContaining({ code: 'invalid_timezone' }))
  })

  it('rejects missing or conflicting current-turn metadata', () => {
    expect(() => timezoneForOpenTurn(events(rpc())))
      .toThrow(expect.objectContaining({ code: 'invalid_timezone' }))
    expect(() => timezoneForOpenTurn(events(rpc('UTC'), rpc('Asia/Shanghai'))))
      .toThrow(expect.objectContaining({ code: 'invalid_timezone' }))
  })

  it('ignores old-turn metadata and never falls back to the Host timezone', () => {
    const oldTurn = events(
      rpc('Asia/Shanghai'),
      { type: 'turn/end', seq: 2, time: 2, data: { turn: 1, reason: { kind: 'completed' } } },
      rpc(),
    )
    expect(() => timezoneForOpenTurn(oldTurn))
      .toThrow(expect.objectContaining({ code: 'invalid_timezone' }))
  })

  it('ignores non-RPC and non-user messages', () => {
    const values = events(
      { ...rpc('UTC'), data: { ...rpc('UTC').data, source: { kind: 'user' } } },
      { ...rpc('UTC'), type: 'assistant/message' },
      rpc('Asia/Shanghai'),
    )
    expect(timezoneForOpenTurn(values)).toBe('Asia/Shanghai')
  })
})
