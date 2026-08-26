import { describe, expect, it } from 'vitest'
import { MAIL_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'

describe('Mail settings card slot registration', () => {
  it('keys the card on the settings namespace it edits', () => {
    expect(MAIL_CARD_SLOT_OPTIONS).toMatchObject({
      name: 'settings.plugin.item',
      key: 'mail',
    })
    expect(MAIL_CARD_SLOT_OPTIONS).not.toHaveProperty('id')
  })
})
