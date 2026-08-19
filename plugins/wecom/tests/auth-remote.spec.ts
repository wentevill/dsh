import { describe, expect, it, vi } from 'vitest'
import { createAuthRemoteApi } from '../src/auth-remote.ts'

describe('authorization remote API', () => {
  it('starts QR authorization without blocking the client request', () => {
    let resolve!: () => void
    const connect = vi.fn(() => new Promise<void>(done => { resolve = done }))
    const api = createAuthRemoteApi({
      snapshot: () => ({ state: 'generating_qr' }), connect, cancel: vi.fn(),
      refresh: vi.fn(), deleteAuthorization: vi.fn(),
    })
    expect(api.connect()).toEqual({ state: 'generating_qr' })
    expect(connect).toHaveBeenCalledOnce()
    resolve()
  })

  it('passes explicit deletion confirmation to the controller', async () => {
    const deleteAuthorization = vi.fn(async () => {})
    const api = createAuthRemoteApi({
      snapshot: () => ({ state: 'unauthorized' }), connect: vi.fn(), cancel: vi.fn(),
      refresh: vi.fn(), deleteAuthorization,
    })
    await api.deleteAuthorization(true)
    expect(deleteAuthorization).toHaveBeenCalledWith(true)
  })
})
