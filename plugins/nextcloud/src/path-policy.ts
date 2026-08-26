import { posix } from 'node:path'

export type AccessMode = 'all' | 'allowlist'

export interface PathPolicySettings {
  readonly accessMode: AccessMode
  readonly allowedRoots: readonly string[]
}

function invalidPath(): never {
  throw new Error('invalid Nextcloud path')
}

export function normalizeRemotePath(input: string): string {
  if (typeof input !== 'string' || !input.startsWith('/') || /[\\\0]/u.test(input)) invalidPath()
  if (/%(?:2f|5c|00)/iu.test(input)) invalidPath()

  const rawSegments = input.split('/')
  for (const segment of rawSegments) {
    let decoded: string
    try {
      decoded = decodeURIComponent(segment)
    } catch {
      invalidPath()
    }
    if (decoded === '..' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) invalidPath()
  }

  const normalized = posix.normalize(input.normalize('NFC'))
  if (!normalized.startsWith('/') || normalized === '/..' || normalized.startsWith('/../')) invalidPath()
  return normalized.length > 1 && normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
}

function contains(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`)
}

export interface PathPolicy {
  readonly roots: readonly string[]
  assertAllowed(path: string): string
  assertMove(source: string, destination: string): { source: string; destination: string }
  assertDeletable(path: string): string
}

export function createPathPolicy(settings: PathPolicySettings): PathPolicy {
  const roots = [...new Set(settings.allowedRoots.map(normalizeRemotePath))]
  if (settings.accessMode === 'allowlist' && roots.length === 0) {
    throw new Error('at least one allowed root is required')
  }

  const assertAllowed = (input: string): string => {
    const path = normalizeRemotePath(input)
    if (settings.accessMode === 'allowlist' && !roots.some(root => contains(root, path))) {
      throw new Error('Nextcloud path is outside configured roots')
    }
    return path
  }

  return {
    roots,
    assertAllowed,
    assertMove(sourceInput, destinationInput) {
      return { source: assertAllowed(sourceInput), destination: assertAllowed(destinationInput) }
    },
    assertDeletable(input) {
      const path = normalizeRemotePath(input)
      if (path === '/') throw new Error('cannot delete the Nextcloud file root')
      assertAllowed(path)
      if (roots.includes(path)) throw new Error('cannot delete a configured root')
      return path
    },
  }
}
