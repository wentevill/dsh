import { describe, expect, it } from 'vitest'
import { clearPollingError, visibleAuthError, type AuthErrors } from '../src/client/error-state.ts'

describe('authorization card error state', () => {
  it('keeps an action failure visible when a later status poll succeeds', () => {
    const errors: AuthErrors = { action: 'authorization failed', polling: 'status failed' }
    const afterPoll = clearPollingError(errors)

    expect(afterPoll).toEqual({ action: 'authorization failed' })
    expect(visibleAuthError(afterPoll)).toBe('authorization failed')
  })
})
