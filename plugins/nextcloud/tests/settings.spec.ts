import { describe, expect, it } from 'vitest'
import { normalizeNextcloudSettings } from '../src/settings.ts'

const base = {
  serverUrl: 'https://cloud.example.com/nextcloud',
  username: 'alice',
  accessMode: 'all' as const,
  allowedRoots: [],
  allowDelete: false,
  allowHttp: false,
  skipTlsVerify: false,
}

describe('Nextcloud settings', () => {
  it('normalizes the server URL and derives the authenticated DAV endpoint', () => {
    expect(normalizeNextcloudSettings(base)).toMatchObject({
      serverUrl: 'https://cloud.example.com/nextcloud',
      davUrl: 'https://cloud.example.com/nextcloud/remote.php/dav/files/alice',
    })
  })

  it('rejects credentials, query strings, fragments, and non-http server URLs', () => {
    for (const serverUrl of [
      'https://alice:secret@cloud.example.com',
      'https://cloud.example.com/?token=secret',
      'https://cloud.example.com/#fragment',
      'file:///tmp/cloud',
    ]) {
      expect(() => normalizeNextcloudSettings({ ...base, serverUrl })).toThrow(/server URL/u)
    }
  })

  it('requires an explicit switch for cleartext HTTP', () => {
    expect(() => normalizeNextcloudSettings({ ...base, serverUrl: 'http://cloud.example.com' })).toThrow(/HTTP is disabled/u)
    expect(normalizeNextcloudSettings({ ...base, serverUrl: 'http://cloud.example.com', allowHttp: true }).davUrl)
      .toBe('http://cloud.example.com/remote.php/dav/files/alice')
  })

  it('requires roots only in allowlist mode and canonicalizes duplicates', () => {
    expect(() => normalizeNextcloudSettings({ ...base, accessMode: 'allowlist' })).toThrow(/allowed root/u)
    expect(normalizeNextcloudSettings({
      ...base,
      accessMode: 'allowlist',
      allowedRoots: ['/AI/', '/AI', '/团队资料'],
    }).allowedRoots).toEqual(['/AI', '/团队资料'])
  })
})
