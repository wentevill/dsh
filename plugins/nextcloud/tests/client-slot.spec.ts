import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import { renderNextcloudConfig } from '../src/client/index.tsx'
import { NEXTCLOUD_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'

describe('Nextcloud settings card slot', () => {
  it('registers configuration on its installed bundle page', () => {
    expect(NEXTCLOUD_CARD_SLOT_OPTIONS).toEqual({
      name: 'plugins.bundle.config', key: 'dsh-nextcloud', locale: 'settings.plugins.nextcloud',
    })
  })

  it('renders a summary separately from the configuration page', () => {
    const props = { view: 'summary' as const, t: (key: string) => key }
    expect(renderNextcloudConfig(props as never, {}, {} as never)).toBe('description')
    expect(isValidElement(renderNextcloudConfig({ ...props, view: 'page' } as never, {}, {} as never))).toBe(true)
  })
})
