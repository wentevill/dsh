import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window })

describe('mail client injection contract', () => {
  it('declares the dynamically mounted Mail Remote before reading it during apply', () => {
    let exports: Record<string, unknown> | undefined
    const loader = {
      load({ factory }: { factory: (require: () => unknown) => Record<string, unknown> }) {
        exports = factory(() => ({}))
      },
    }
    ;(globalThis as unknown as { window: unknown }).window = { __ModuleLoader__: loader }
    Function(readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8'))()

    expect(exports?.inject).toContain('remote.mailSettings')
  })
})
