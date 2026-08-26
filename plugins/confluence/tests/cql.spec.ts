import { describe, expect, it } from 'vitest'
import { buildPageCql } from '../src/cql.ts'

describe('Confluence page CQL', () => {
  it('escapes model text and injects the configured space allowlist', () => {
    expect(buildPageCql({
      query: 'release "alpha" \\ test', labels: ['docs'],
      requestedSpaces: [], allowedSpaces: ['ENG', '~alice'], allowAllSpaces: false,
    })).toBe('type = page AND siteSearch ~ "release \\"alpha\\" \\\\ test" AND label = "docs" AND space IN ("ENG", "~alice")')
  })

  it('rejects a requested space outside the allowlist', () => {
    expect(() => buildPageCql({
      query: 'payroll', labels: [], requestedSpaces: ['HR'], allowedSpaces: ['ENG'], allowAllSpaces: false,
    })).toThrow(/not allowed/u)
  })
})
