import { describe, expect, it } from 'vitest'
import { normalizeConfluenceSettings, spaceAllowed } from '../src/settings.ts'

describe('Confluence settings', () => {
  it('normalizes an HTTPS base URL while retaining its context path', () => {
    expect(normalizeConfluenceSettings({
      baseUrl: 'https://wiki.example.test/confluence/',
      allowAllSpaces: false,
      allowedSpaceKeys: ['ENG', ' eng ', '~alice'],
    })).toEqual({
      baseUrl: 'https://wiki.example.test/confluence',
      allowAllSpaces: false,
      allowedSpaceKeys: ['ENG', '~alice'],
    })
  })

  it.each([
    'http://wiki.example.test',
    'https://user:secret@wiki.example.test',
    'https://wiki.example.test/confluence?token=secret',
    'https://wiki.example.test/confluence#fragment',
  ])('rejects an unsafe base URL: %s', baseUrl => {
    expect(() => normalizeConfluenceSettings({
      baseUrl,
      allowAllSpaces: true,
      allowedSpaceKeys: [],
    })).toThrow(/Confluence HTTPS base URL/u)
  })

  it('requires exactly one explicit space policy', () => {
    expect(() => normalizeConfluenceSettings({
      baseUrl: 'https://wiki.example.test',
      allowAllSpaces: false, allowedSpaceKeys: [],
    })).toThrow(/space/u)
    expect(() => normalizeConfluenceSettings({
      baseUrl: 'https://wiki.example.test',
      allowAllSpaces: true, allowedSpaceKeys: ['ENG'],
    })).toThrow(/space/u)
  })

  it('compares allowlisted space keys case-insensitively', () => {
    const settings = normalizeConfluenceSettings({
      baseUrl: 'https://wiki.example.test',
      allowAllSpaces: false, allowedSpaceKeys: ['Eng'],
    })
    expect(spaceAllowed(settings, 'ENG')).toBe(true)
    expect(spaceAllowed(settings, 'HR')).toBe(false)
  })
})
