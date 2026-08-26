import { describe, expect, it } from 'vitest'
import { nextcloudProviderError } from '../src/errors.ts'

describe('Nextcloud provider error mapping', () => {
  it.each([[401, 'NEXTCLOUD_AUTH_FAILED'], [403, 'NEXTCLOUD_FORBIDDEN'], [404, 'NEXTCLOUD_NOT_FOUND'], [409, 'NEXTCLOUD_CONFLICT'], [507, 'NEXTCLOUD_QUOTA_EXCEEDED']])(
    'maps HTTP %i to %s without leaking provider details', (status, code) => {
      const error = nextcloudProviderError(Object.assign(new Error('sentinel response body'), { status }))
      expect(error.code).toBe(code)
      expect(error.message).not.toContain('sentinel')
    },
  )

  it('uses a stable generic category for unknown network failures', () => {
    expect(nextcloudProviderError(new Error('socket leaked secret')).code).toBe('NEXTCLOUD_PROVIDER_FAILED')
  })
})
