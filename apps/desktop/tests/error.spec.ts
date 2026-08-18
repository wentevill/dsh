import { describe, expect, it } from 'vitest'
import { boundedDiagnostic } from '../src/error.ts'

describe('boundedDiagnostic', () => {
  it('limits process output while preserving the failure stage', () => {
    const diagnostic = boundedDiagnostic('ready-timeout', 'x'.repeat(40_000))
    expect(diagnostic.stage).toBe('ready-timeout')
    expect(new TextEncoder().encode(diagnostic.detail).byteLength).toBe(32 * 1024)
  })

  it('does not include environment values', () => {
    const diagnostic = boundedDiagnostic('runtime-start', 'failed', {
      PATH: '/private/tools',
      DEEPSEEK_API_KEY: 'secret',
    })
    expect(JSON.stringify(diagnostic)).toBe('{"stage":"runtime-start","detail":"failed"}')
  })
})
