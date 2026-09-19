import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { auditApp, signApp } from './audit-app.ts'

function appFixture(): string {
  const app = join(mkdtempSync(join(tmpdir(), 'dsh-app-')), 'DeepSeek Harness.app')
  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true })
  writeFileSync(join(app, 'Contents/MacOS/DeepSeek Harness'), 'binary')
  return app
}

describe('application audit', () => {
  it('requires an application bundle', () => {
    expect(() => auditApp('/missing/DeepSeek Harness.app')).toThrow(/Missing macOS application bundle/)
  })

  it('rejects non-arm64 and universal executables', () => {
    const app = appFixture()
    const signature = vi.fn()
    expect(() => auditApp(app, { architectures: () => ['x86_64'], runtime: vi.fn(), signature })).toThrow(/arm64-only/)
    expect(() => auditApp(app, { architectures: () => ['arm64', 'x86_64'], runtime: vi.fn(), signature })).toThrow(/arm64-only/)
  })

  it('audits packaged resources and the bundle signature for an arm64 application', () => {
    const runtime = vi.fn()
    const signature = vi.fn()
    const app = appFixture()
    auditApp(app, { architectures: () => ['arm64'], runtime, signature })
    expect(runtime).toHaveBeenCalledWith(join(app, 'Contents/Resources/runtime'))
    expect(signature).toHaveBeenCalledWith(app)
  })

  it('ad-hoc signs the complete application bundle', () => {
    const calls: Array<{ command: string; args: string[] }> = []

    signApp('/release/DeepSeek Harness.app', (command, args) => calls.push({ command, args }))

    expect(calls).toEqual([{
      command: 'codesign',
      args: ['--force', '--deep', '--sign', '-', '/release/DeepSeek Harness.app'],
    }])
  })
})
