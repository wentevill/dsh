import { describe, expect, it } from 'vitest'
import { WECOM_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'

describe('WeCom settings card slot registration', () => {
  it('uses a list-slot id during deferred plugin loading', () => {
    expect(WECOM_CARD_SLOT_OPTIONS).toMatchObject({
      name: 'settings.plugin.item',
      id: 'wecom',
    })
    expect(WECOM_CARD_SLOT_OPTIONS).not.toHaveProperty('key')
  })
})
