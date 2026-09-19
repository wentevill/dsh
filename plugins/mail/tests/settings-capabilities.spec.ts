import { describe, expect, it } from 'vitest'
import * as mailSettings from '../src/mail-settings.ts'

describe('mail settings capabilities', () => {
  it('defaults optional mail capabilities to disabled', () => {
    const settings = mailSettings.MailSettingsSchema({})
    expect(settings).toMatchObject({
      archiveMailbox: 'Archive',
      imap: { host: '', port: 993, secure: true },
      smtp: { host: '', port: 465, secure: true },
    })
    expect(settings).not.toHaveProperty('allowDelete')
  })

  it('derives only endpoint-backed capabilities', () => {
    const disabled = mailSettings.MailSettingsSchema({})
    const capabilities = (mailSettings as typeof mailSettings & {
      mailCapabilities: (settings: typeof disabled) => unknown
    }).mailCapabilities

    expect(capabilities(disabled)).toEqual({ imap: false, smtp: false })
    expect(capabilities({
      ...disabled,
      imap: { ...disabled.imap, host: 'imap.test' },
    })).toEqual({ imap: true, smtp: false })
  })
})
