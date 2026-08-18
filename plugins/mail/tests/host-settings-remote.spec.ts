import { describe, expect, it } from 'vitest'
import { saveMailSettings } from '../src/remote-settings.ts'
import type { MailSettings } from '../src/mail-settings.ts'

const configured: MailSettings = {
  username: 'user@example.com',
  passwordEnv: 'MAIL_APP_PASSWORD',
  mailbox: 'INBOX',
  imap: { host: 'imap.example.com', port: 993, secure: true },
  smtp: { host: 'smtp.example.com', port: 465, secure: true },
}

describe('mail Host settings save', () => {
  it('returns the durable value owned by the Host settings scope', async () => {
    let durable: MailSettings = {
      ...configured,
      smtp: { host: 'old.example.com', port: 465, secure: true },
    }
    const scope = {
      async replace(value: MailSettings) { durable = structuredClone(value) },
      get() { return structuredClone(durable) },
    }
    await expect(saveMailSettings(scope as never, { settings: configured })).resolves.toEqual({ settings: configured })
    expect(durable).toEqual(configured)
  })
})
