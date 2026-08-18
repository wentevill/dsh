import { describe, expect, it } from 'vitest'
import * as mailSettings from '../src/mail-settings.ts'

describe('mail settings capabilities', () => {
  it('defaults optional mail capabilities to disabled', () => {
    expect(mailSettings.MailSettingsSchema({})).toMatchObject({
      archiveMailbox: 'Archive',
      allowDelete: false,
      imap: { host: '', port: 993, secure: true },
      smtp: { host: '', port: 465, secure: true },
    })
  })

  it('enables IMAP and deletion independently of SMTP', () => {
    const disabled = mailSettings.MailSettingsSchema({})
    const capabilities = (mailSettings as typeof mailSettings & {
      mailCapabilities: (settings: typeof disabled) => unknown
    }).mailCapabilities

    expect(capabilities(disabled)).toEqual({ imap: false, smtp: false, delete: false })
    expect(capabilities({
      ...disabled,
      imap: { ...disabled.imap, host: 'imap.test' },
      allowDelete: true,
    })).toEqual({ imap: true, smtp: false, delete: true })
  })
})
