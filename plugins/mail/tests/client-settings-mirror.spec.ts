import { describe, expect, it } from 'vitest'
import { createMailSettingsMirror } from '../src/client/settings-mirror.ts'

const settings = {
  username: 'user@example.com',
  passwordEnv: 'MAIL_APP_PASSWORD',
  mailbox: 'INBOX',
  imap: { host: 'imap.example.com', port: 993, secure: true },
  smtp: { host: 'smtp.example.com', port: 465, secure: true },
}

describe('mail settings mirror', () => {
  it('starts with the Host-resolved example and publishes a saved replacement', () => {
    const mirror = createMailSettingsMirror(settings)
    let publications = 0
    mirror.scope.subscribe(() => { publications += 1 })

    expect(mirror.scope.getSnapshot()).toMatchObject({ status: 'ready', value: settings, writable: true })

    const saved = { ...settings, smtp: { ...settings.smtp, host: 'smtp.saved.example.com' } }
    mirror.accept(saved)

    expect(mirror.scope.getSnapshot().value).toEqual(saved)
    expect(publications).toBe(1)
  })
})
