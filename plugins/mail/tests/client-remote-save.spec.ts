import { describe, expect, it } from 'vitest'
import { unwrapMailSettingsSave } from '../src/client/remote-save.ts'

const settings = {
  username: 'user@example.com',
  passwordEnv: 'MAIL_APP_PASSWORD',
  mailbox: 'INBOX',
  imap: { host: 'imap.example.com', port: 993, secure: true },
  smtp: { host: 'smtp.example.com', port: 465, secure: true },
}

describe('mail Remote save response', () => {
  it('unwraps the RemoteResult returned directly by Typert', () => {
    expect(unwrapMailSettingsSave({ ok: true, value: { settings } })).toEqual({ settings })
  })

  it('surfaces the Host correction message', () => {
    expect(() => unwrapMailSettingsSave({
      ok: false,
      error: { code: 'invalid-request', message: 'mail settings are invalid', details: {} },
    })).toThrow('mail settings are invalid')
  })
})
