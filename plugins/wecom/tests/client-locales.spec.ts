import { describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'
import { css } from '../src/client/card-css.ts'

describe('WeCom authorization card copy and controls', () => {
  it('ships complete matching English and Chinese dictionaries', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
    expect(en.authorize).toBe('Authorize WeCom')
    expect(zh.authorize).toBe('授权企业微信')
    expect(en.qrAlt).toBe('WeCom authorization QR code')
    expect(zh.qrAlt).toBe('企业微信授权二维码')
  })

  it('provides distinct primary, secondary, and danger button classes', () => {
    expect(css.primary).not.toBe(css.secondary)
    expect(css.primary).not.toBe(css.danger)
    expect(css.actions).toMatch(/^dwm_/u)
  })
})
