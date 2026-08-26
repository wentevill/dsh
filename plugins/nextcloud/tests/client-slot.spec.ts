import { describe, expect, it } from 'vitest'
import { NEXTCLOUD_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'

describe('Nextcloud settings card slot', () => {
  it('registers a stable plugin settings identity', () => {
    expect(NEXTCLOUD_CARD_SLOT_OPTIONS).toEqual({
      name: 'settings.plugin.item', key: 'nextcloud', locale: 'settings.plugins.nextcloud',
    })
  })
})
