import { describe, expect, it } from 'vitest'
import { PLUGIN_MANAGER_TAB_OPTIONS } from '../src/client/slot-options.ts'

describe('Plugin manager tab registration', () => {
  it('registers immediately after the Plugin list tab', () => {
    expect(PLUGIN_MANAGER_TAB_OPTIONS).toMatchObject({
      name: 'settings.plugins.tab',
      id: 'plugin-manager',
      order: 20,
      locale: 'settings.plugins.manager',
    })
  })
})
