import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { auditApp } from './audit-app.ts'

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
    expect(() => auditApp(app, { architectures: () => ['x86_64'], runtime: vi.fn() })).toThrow(/arm64-only/)
    expect(() => auditApp(app, { architectures: () => ['arm64', 'x86_64'], runtime: vi.fn() })).toThrow(/arm64-only/)
  })

  it('audits packaged resources for an arm64 application', () => {
    const runtime = vi.fn()
    const app = appFixture()
    auditApp(app, { architectures: () => ['arm64'], runtime })
    expect(runtime).toHaveBeenCalledWith(join(app, 'Contents/Resources/runtime'))
  })
})
