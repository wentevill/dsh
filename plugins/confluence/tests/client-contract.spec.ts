import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CONFLUENCE_CARD_SLOT_OPTIONS } from '../src/client/slot-options.ts'
import { unwrapRemote } from '../src/client/remote-result.ts'

describe('Confluence settings client contract', () => {
  it('registers its card under the Host settings namespace', () => {
    expect(CONFLUENCE_CARD_SLOT_OPTIONS).toEqual({ name: 'settings.plugin.item', key: 'confluence' })
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
