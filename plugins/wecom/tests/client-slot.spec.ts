import { describe, expect, it } from 'vitest'
import { WECOM_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'

describe('WeCom settings card slot registration', () => {
  it('keys the card on the settings namespace it edits', () => {
    expect(WECOM_CARD_SLOT_OPTIONS).toMatchObject({
      name: 'settings.plugin.item',
      key: 'wecom',
    })
    expect(WECOM_CARD_SLOT_OPTIONS).not.toHaveProperty('id')
  })
})
