import { describe, expect, it } from 'vitest'
import { createPathPolicy, normalizeRemotePath } from '../src/path-policy.ts'

describe('Nextcloud path policy', () => {
  it('normalizes safe absolute virtual paths without changing Unicode names', () => {
    expect(normalizeRemotePath('/团队资料/季度 报告.txt')).toBe('/团队资料/季度 报告.txt')
    expect(normalizeRemotePath('/AI//notes/./today.md')).toBe('/AI/notes/today.md')
  })

  it('rejects traversal, encoded separators, NULs, and backslashes', () => {
    for (const path of ['/AI/../secret', '/AI/%2e%2e/secret', '/AI/%2Fsecret', '/AI/a\\b', '/AI/a\0b']) {
      expect(() => normalizeRemotePath(path)).toThrow(/invalid Nextcloud path/u)
    }
  })

  it('matches allowlisted roots by complete path segment', () => {
    const policy = createPathPolicy({ accessMode: 'allowlist', allowedRoots: ['/AI', '/团队资料'] })
    expect(policy.assertAllowed('/AI')).toBe('/AI')
    expect(policy.assertAllowed('/AI/reports/q1.pdf')).toBe('/AI/reports/q1.pdf')
    expect(policy.assertAllowed('/团队资料/计划.md')).toBe('/团队资料/计划.md')
    expect(() => policy.assertAllowed('/AI-private/secret.txt')).toThrow(/outside configured roots/u)
    expect(() => policy.assertAllowed('/other/file.txt')).toThrow(/outside configured roots/u)
  })

  it('checks both source and destination and protects configured roots from deletion', () => {
    const policy = createPathPolicy({ accessMode: 'allowlist', allowedRoots: ['/AI', '/Shared'] })
    expect(policy.assertMove('/AI/a.txt', '/Shared/a.txt')).toEqual({ source: '/AI/a.txt', destination: '/Shared/a.txt' })
    expect(() => policy.assertMove('/AI/a.txt', '/Outside/a.txt')).toThrow(/outside configured roots/u)
    expect(() => policy.assertDeletable('/AI')).toThrow(/configured root/u)
    expect(() => policy.assertDeletable('/')).toThrow(/file root/u)
    expect(policy.assertDeletable('/AI/old.txt')).toBe('/AI/old.txt')
  })

  it('allows every normalized path in all-directory mode but still protects the file root', () => {
    const policy = createPathPolicy({ accessMode: 'all', allowedRoots: [] })
    expect(policy.assertAllowed('/anything/file.txt')).toBe('/anything/file.txt')
    expect(() => policy.assertDeletable('/')).toThrow(/file root/u)
  })
})
