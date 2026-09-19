import { describe, expect, it } from 'vitest'
import { isValidElement } from 'react'
import { renderWeComConfig } from '../src/client/index.tsx'
import { WECOM_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'

describe('WeCom settings card slot registration', () => {
  it('registers configuration on its installed bundle page', () => {
    expect(WECOM_CARD_SLOT_OPTIONS).toMatchObject({
      name: 'plugins.bundle.config',
      key: 'dsh-wecom',
      locale: 'settings.plugins.wecom',
    })
    expect(WECOM_CARD_SLOT_OPTIONS).not.toHaveProperty('id')
  })

  it('renders a summary separately from the authorization page', () => {
    const props = { view: 'summary' as const, t: (key: string) => key }
    expect(renderWeComConfig(props as never, {})).toBe('description')
    expect(isValidElement(renderWeComConfig({ ...props, view: 'page' } as never, {}))).toBe(true)
  })
})
