import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

interface UpstreamLock {
  readonly remote: string
  readonly revision: string
}

export interface UpstreamState {
  readonly revision: string
  readonly status: string
  readonly trackedDigest: string
}

function git(upstream: string, ...args: string[]): string {
  return execFileSync('git', ['-C', upstream, ...args], { encoding: 'utf8' }).trim()
}

function resolveUpstream(root: string): string {
  const absoluteRoot = realpathSync(resolve(root))
  const link = resolve(absoluteRoot, 'upstream')
  if (!lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw new Error('packaging: upstream must be a symlink')
  }
  const upstream = realpathSync(link)
  const fromRoot = relative(absoluteRoot, upstream)
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`)) {
    throw new Error('packaging: upstream symlink escapes packaging root')
  }
  return upstream
}

/** Capture immutable Git identity plus dirty state without changing upstream. */
export function captureUpstreamState(root: string): UpstreamState {
  const upstream = resolveUpstream(root)
  const revision = git(upstream, 'rev-parse', 'HEAD')
  const status = git(upstream, 'status', '--porcelain')
  const index = git(upstream, 'ls-files', '-s')
  const trackedDigest = createHash('sha256').update(`${revision}\n${index}\n`).digest('hex')
  return { revision, status, trackedDigest }
}

/** Require the configured upstream symlink to match its locked clean Git checkout. */
export function assertUpstream(root: string): void {
  const upstream = resolveUpstream(root)
  const lock = JSON.parse(readFileSync(resolve(root, 'upstream.lock.json'), 'utf8')) as UpstreamLock
  const state = captureUpstreamState(root)
  if (state.status !== '') throw new Error('packaging: upstream working tree is not clean')
  if (state.revision !== lock.revision) {
    throw new Error(`packaging: upstream revision mismatch: expected ${lock.revision}, got ${state.revision}`)
  }
  const remote = git(upstream, 'remote', 'get-url', 'origin')
  if (remote !== lock.remote) {
    throw new Error(`packaging: upstream remote mismatch: expected ${lock.remote}, got ${remote}`)
  }
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  assertUpstream(root)
  process.stdout.write(`upstream verified: ${captureUpstreamState(root).revision}\n`)
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
