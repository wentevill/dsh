import { describe, expect, it } from 'vitest'
import { markdownToStorage, storageToText } from '../src/content.ts'

describe('Confluence content conversion', () => {
  it('renders the supported Markdown subset as storage XHTML', () => {
    expect(markdownToStorage('# Title\n\nHello **team**.\n\n- one\n- two')).toBe(
      '<h1>Title</h1>\n<p>Hello <strong>team</strong>.</p>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>',
    )
  })

  it('escapes raw HTML and rejects unsafe link schemes', () => {
    const value = markdownToStorage('<script>alert(1)</script> [click](javascript:alert(1))')
    expect(value).toContain('&lt;script&gt;')
    expect(value).not.toContain('<script>')
    expect(value).not.toContain('href="javascript:')
  })

  it('extracts bounded readable text from storage markup', () => {
    expect(storageToText('<h1>Title</h1><p>Hello &amp; goodbye</p>', 17)).toEqual({
      text: 'Title\nHello & goo',
      truncated: true,
    })
  })
})
