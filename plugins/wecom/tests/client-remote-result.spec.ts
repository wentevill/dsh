import { describe, expect, it } from 'vitest'
import { unwrapAuthResult } from '../src/client/remote-result.ts'

describe('WeCom authorization RemoteResult', () => {
  it('returns the authorization snapshot from a successful carrier result', () => {
    expect(unwrapAuthResult({ ok: true, value: { state: 'generating_qr' } })).toEqual({ state: 'generating_qr' })
  })

  it('throws the carrier message so the card can display the failure', () => {
    expect(() => unwrapAuthResult({
      ok: false,
      error: { code: 'REMOTE_FAILED', message: 'authorization unavailable', details: {} },
    })).toThrow('authorization unavailable')
  })
})
