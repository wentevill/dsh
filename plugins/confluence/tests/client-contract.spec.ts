import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isValidElement } from 'react'
import { renderConfluenceConfig } from '../src/client/index.tsx'
import { CONFLUENCE_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'
import { unwrapRemote } from '../src/client/remote-result.ts'
import { en, zh } from '../src/client/locales.ts'

describe('Confluence settings client contract', () => {
  it('registers configuration on its installed bundle page', () => {
    expect(CONFLUENCE_CARD_SLOT_OPTIONS).toEqual({
      name: 'plugins.bundle.config', key: 'dsh-confluence', locale: 'settings.plugins.confluence',
    })
  })

  it('renders a summary separately from the configuration page', () => {
    const props = { view: 'summary' as const, t: (key: string) => key }
    expect(renderConfluenceConfig(props as never, {}, {} as never)).toBe('description')
    expect(isValidElement(renderConfluenceConfig({ ...props, view: 'page' } as never, {}, {} as never))).toBe(true)
  })

  it('ships complete English and Chinese settings dictionaries', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    expect(en.save).toBe('Save')
    expect(zh.save).toBe('保存')
  })

  it('unwraps generated Typert Remote results', () => {
    expect(unwrapRemote({ ok: true, value: { version: '9.2.1' } })).toEqual({ version: '9.2.1' })
    expect(() => unwrapRemote({ ok: false, error: { message: 'not connected' } })).toThrow('not connected')
  })

  it('loads settings only once so field edits survive rerenders and blur', () => {
    const source = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
    expect(source).toContain('const initialRemote = useRef(remoteApi)')
    expect(source).toContain('initialRemote.current.load()')
    expect(source).toContain('}, [])')
    expect(source).not.toContain('}, [remoteApi])')
  })
})
