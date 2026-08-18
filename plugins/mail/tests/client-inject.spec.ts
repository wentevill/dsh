import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window })

describe('mail client injection contract', () => {
  it('mounts its own Mail Remote instead of deadlocking on it as a loader prerequisite', () => {
    let exports: Record<string, unknown> | undefined
    const loader = {
      load({ factory }: { factory: (require: (name: string) => unknown) => Record<string, unknown> }) {
        exports = factory(name => name === '@deepseek-ai/cordis' ? { Service: class {} } : {})
      },
    }
    ;(globalThis as unknown as { window: unknown }).window = { __ModuleLoader__: loader }
    Function(readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8'))()

    expect(exports?.inject).toEqual(['remote'])
    expect((exports?.mailClientFeature as { inject?: string[] } | undefined)?.inject).toContain('remote.mailSettings')
  })
})
