import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, realpath, stat, unlink } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

function inside(root: string, target: string): boolean {
  const fromRoot = relative(root, target)
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot)
}

async function canonicalWorkspace(workspace: string): Promise<string> {
  const root = await realpath(workspace)
  if (!(await stat(root)).isDirectory()) throw new Error('session workspace is unavailable')
  return root
}

export interface WorkspaceFileSnapshot {
  readonly path: string
  readonly size: number
  readonly sha256: string
}

export async function snapshotWorkspaceFile(workspace: string, input: string, signal?: AbortSignal): Promise<WorkspaceFileSnapshot> {
  const root = await canonicalWorkspace(workspace)
  const candidate = isAbsolute(input) ? resolve(input) : resolve(root, input)
  let path: string
  try {
    path = await realpath(candidate)
  } catch {
    throw new Error('workspace file is unavailable')
  }
  if (!inside(root, path)) throw new Error('workspace file is outside session workspace')
  const metadata = await stat(path)
  if (!metadata.isFile()) throw new Error('workspace source must be a regular file')
  const hash = createHash('sha256')
  const stream = createReadStream(path, { signal })
  for await (const chunk of stream) hash.update(chunk as Buffer)
  return { path, size: metadata.size, sha256: hash.digest('hex') }
}

function safeBasename(remotePath: string): string {
  const name = basename(remotePath)
  if (name.length === 0 || name === '.' || name === '..' || /[\\/\0\r\n]/u.test(name)) return 'download'
  return name
}

function collisionName(name: string, index: number): string {
  if (index === 0) return name
  const extension = extname(name)
  return `${name.slice(0, name.length - extension.length)} (${index})${extension}`
}

export async function downloadIntoWorkspace(
  workspace: string,
  remotePath: string,
  input: Readable,
  explicitDestination?: string,
  signal?: AbortSignal,
): Promise<string> {
  const root = await canonicalWorkspace(workspace)
  const relativeDestination = explicitDestination ?? join('.nextcloud-downloads', safeBasename(remotePath))
  const initial = resolve(root, relativeDestination)
  if (!inside(root, initial)) throw new Error('download destination is outside session workspace')
  await mkdir(dirname(initial), { recursive: true, mode: 0o700 })
  const parent = await realpath(dirname(initial))
  if (!inside(root, parent)) throw new Error('download destination is outside session workspace')

  const base = explicitDestination === undefined ? safeBasename(remotePath) : basename(initial)
  for (let index = 0; index < 10_000; index += 1) {
    const target = explicitDestination === undefined ? join(parent, collisionName(base, index)) : initial
    let handle
    try {
      handle = await open(target, 'wx', 0o600)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST' && explicitDestination === undefined) continue
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('download destination already exists')
      throw error
    }
    try {
      await pipeline(input, handle.createWriteStream(), { signal })
    } catch (error) {
      await handle.close().catch(() => undefined)
      await unlink(target).catch(() => undefined)
      throw error
    }
    const stored = relative(root, target)
    return stored.split(sep).join('/')
  }
  throw new Error('cannot allocate a collision-safe download name')
}
