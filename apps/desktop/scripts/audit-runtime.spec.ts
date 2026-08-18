import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditRuntime } from './audit-runtime.ts'

function fixture(nodeScript = '#!/bin/sh\necho arm64\n'): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-audit-'))
  for (const path of ['node/bin', 'app/node_modules/.bin', 'app/node_modules/pnpm/bin', 'app/node_modules/@deepseek-ai/dsh/lib', 'app/node_modules/@deepseek-ai/dsh-web-frontend/dist']) {
    mkdirSync(join(root, path), { recursive: true })
  }
  writeFileSync(join(root, 'node/bin/node'), nodeScript, { mode: 0o755 })
  writeFileSync(join(root, 'app/node_modules/@deepseek-ai/dsh/lib/bin.js'), 'console.log("ok")')
  writeFileSync(join(root, 'app/node_modules/@deepseek-ai/dsh/package.json'), JSON.stringify({ dependencies: {} }))
  writeFileSync(join(root, 'app/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html'), '<html></html>')
  writeFileSync(join(root, 'app/node_modules/pnpm/bin/pnpm.cjs'), 'pnpm entry')
  writeFileSync(join(root, 'app/node_modules/.bin/pnpm'), '#!/bin/sh\necho 11.7.0\n', { mode: 0o755 })
  return root
}

describe('runtime audit', () => {
  it('accepts a minimal arm64 production package graph', () => expect(() => auditRuntime(fixture())).not.toThrow())

  it.each([
    ['wrong architecture', 'console.log("x64")'],
    ['pnpm store', '/tmp/pnpm-store/v3'],
    ['developer path', `${process.cwd()}/packages/example`],
    ['source import', 'import "@deepseek-ai/dsh/src/index.ts"'],
  ])('rejects %s', (name, content) => {
    const root = fixture(name === 'wrong architecture' ? '#!/bin/sh\necho x64\n' : undefined)
    if (name !== 'wrong architecture') writeFileSync(join(root, 'app/bad.js'), content)
    expect(() => auditRuntime(root)).toThrow()
  })

  it('rejects missing CLI and Web artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-audit-missing-'))
    expect(() => auditRuntime(root)).toThrow(/Missing runtime artifact/)
  })

  it('rejects a runtime without the private pnpm entry', () => {
    const root = fixture()
    rmSync(join(root, 'app/node_modules/pnpm/bin/pnpm.cjs'))
    expect(() => auditRuntime(root)).toThrow(/Missing runtime artifact: app\/node_modules\/pnpm\/bin\/pnpm.cjs/)
  })

  it('rejects a private pnpm version other than 11.7.0', () => {
    const root = fixture()
    writeFileSync(join(root, 'app/node_modules/.bin/pnpm'), '#!/bin/sh\necho 10.0.0\n', { mode: 0o755 })
    expect(() => auditRuntime(root)).toThrow(/pnpm version must be 11\.7\.0, got 10\.0\.0/)
  })

  it('rejects a private pnpm launcher that is not executable', () => {
    const root = fixture()
    writeFileSync(join(root, 'app/node_modules/.bin/pnpm'), '#!/bin/sh\necho 11.7.0\n', { mode: 0o644 })
    chmodSync(join(root, 'app/node_modules/.bin/pnpm'), 0o644)
    expect(() => auditRuntime(root)).toThrow(/pnpm launcher must be executable/)
  })

  it('rejects a dsh package whose declared runtime dependency is absent', () => {
    const root = fixture()
    writeFileSync(join(root, 'app/node_modules/@deepseek-ai/dsh/package.json'), JSON.stringify({
      dependencies: { '@deepseek-ai/missing-runtime': 'workspace:^' },
    }))
    expect(() => auditRuntime(root)).toThrow(/Unresolvable runtime dependency/)
  })

  it('rejects a missing transitive workspace runtime dependency', () => {
    const root = fixture()
    const cordis = join(root, 'app/node_modules/@deepseek-ai/cordis')
    mkdirSync(cordis, { recursive: true })
    writeFileSync(join(cordis, 'package.json'), JSON.stringify({
      name: '@deepseek-ai/cordis',
      dependencies: { '@deepseek-ai/missing-transitive': 'workspace:^' },
    }))
    expect(() => auditRuntime(root)).toThrow(/@deepseek-ai\/cordis.*@deepseek-ai\/missing-transitive/)
  })

  it('rejects a missing required peer but permits an optional peer', () => {
    const root = fixture()
    writeFileSync(join(root, 'app/node_modules/@deepseek-ai/dsh/package.json'), JSON.stringify({
      dependencies: {},
      peerDependencies: {
        '@deepseek-ai/missing-peer': 'workspace:^',
        '@deepseek-ai/optional-peer': 'workspace:^',
      },
      peerDependenciesMeta: { '@deepseek-ai/optional-peer': { optional: true } },
    }))
    expect(() => auditRuntime(root)).toThrow(/@deepseek-ai\/missing-peer/)
  })

  it('rejects internal package links that a Tauri directory bundle would omit', () => {
    const root = fixture()
    mkdirSync(join(root, 'app/node_modules/package-target'))
    symlinkSync('package-target', join(root, 'app/node_modules/package-link'))
    expect(() => auditRuntime(root)).toThrow(/Runtime contains non-portable symlink/)
  })
})
