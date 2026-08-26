import { describe, expect, it } from 'vitest'
import { createNextcloudTransport } from '../src/transport.ts'
import { normalizeNextcloudSettings } from '../src/settings.ts'

const live = process.env.NEXTCLOUD_TEST_URL && process.env.NEXTCLOUD_TEST_USERNAME && process.env.NEXTCLOUD_TEST_APP_PASSWORD

describe.skipIf(!live)('live Nextcloud smoke test', () => {
  it('authenticates and lists the configured file root', async () => {
    const transport = createNextcloudTransport(normalizeNextcloudSettings({
      serverUrl: process.env.NEXTCLOUD_TEST_URL!, username: process.env.NEXTCLOUD_TEST_USERNAME!,
      accessMode: 'all', allowedRoots: [], allowDelete: false,
      allowHttp: process.env.NEXTCLOUD_TEST_ALLOW_HTTP === '1', skipTlsVerify: process.env.NEXTCLOUD_TEST_SKIP_TLS_VERIFY === '1',
    }), process.env.NEXTCLOUD_TEST_APP_PASSWORD!)
    expect((await transport.stat('/')).type).toBe('directory')
    expect(Array.isArray(await transport.list('/'))).toBe(true)
    expect(Array.isArray(await transport.sharing.listShares())).toBe(true)
  })
})
