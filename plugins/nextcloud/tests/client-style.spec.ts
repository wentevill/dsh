import { describe, expect, it } from 'vitest'
import { nextcloudCardStyleText } from '../src/client/card-css.ts'

describe('Nextcloud settings card style', () => {
  it('uses isolated classes and the host design tokens', () => {
    expect(nextcloudCardStyleText).toContain('.dln_card')
    expect(nextcloudCardStyleText).toContain('var(--dsw-alias-border-l2)')
    expect(nextcloudCardStyleText).toContain('var(--dsw-alias-brand-primary)')
  })
})
