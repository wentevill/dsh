import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

function checkedFile(root: string, path: string): string {
  if (isAbsolute(path)) throw new Error(`packaging: extracted path must be relative: ${path}`)
  const absoluteRoot = resolve(root)
  const absolute = resolve(absoluteRoot, path)
  const fromRoot = relative(absoluteRoot, absolute)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
    throw new Error(`packaging: extracted path escapes packaging root: ${path}`)
  }
  let metadata
  try {
    metadata = lstatSync(absolute)
  } catch {
    throw new Error(`packaging: missing extracted file: ${path}`)
  }
  if (!metadata.isFile()) throw new Error(`packaging: extracted path must be a regular file: ${path}`)
  return absolute
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Build a deterministic sha256sum-compatible manifest for extracted files. */
export function buildExtractionManifest(root: string, paths: readonly string[]): string {
  const unique = [...new Set(paths)].sort()
  return unique.map(path => `${digest(checkedFile(root, path))}  ${path}`).join('\n') + '\n'
}

/** Verify every record in an extraction manifest against regular files under root. */
export function verifyExtractionManifest(root: string, manifest: string): void {
  for (const line of manifest.split('\n')) {
    if (line === '') continue
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line)
    if (match === null) throw new Error(`packaging: invalid extraction manifest line: ${line}`)
    const [, expected, path] = match
    const actual = digest(checkedFile(root, path))
    if (actual !== expected) throw new Error(`packaging: extraction hash mismatch for ${path}`)
  }
}
