import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import { MailConfig } from '../src/client/MailCard.tsx'
import { MAIL_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'

describe('Mail settings card slot registration', () => {
  it('registers configuration on its installed bundle page', () => {
    expect(MAIL_CARD_SLOT_OPTIONS).toMatchObject({
      name: 'plugins.bundle.config',
      key: 'dsh-mail',
      locale: 'settings.plugins.mail',
    })
    expect(MAIL_CARD_SLOT_OPTIONS).not.toHaveProperty('id')
  })

  it('renders a description summary without constructing the settings form', () => {
    const props = { view: 'summary' as const, t: (key: string) => key }
    expect(MailConfig(props as never)).toBe('mailDescription')
    expect(isValidElement(MailConfig({ ...props, view: 'page' } as never))).toBe(true)
  })
})
