import { describe, expect, it } from 'vitest'
import { Config } from '../src/config.ts'

describe('Confluence Host configuration', () => {
  it('ships disabled defaults that require explicit space consent', () => {
    expect(Config({} as never)).toEqual({
      baseUrl: '', allowAllSpaces: false, allowedSpaceKeys: [],
    })
  })
})
