import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { posix } from 'node:path'
import { createGunzip } from 'node:zlib'
import { extract } from 'tar-stream'
import semver from 'semver'
import { PluginManagerError } from './errors.ts'

const MAX_COMPRESSED_BYTES = 100 * 1024 * 1024
const MAX_EXPANDED_BYTES = 512 * 1024 * 1024
const MAX_ENTRY_BYTES = 128 * 1024 * 1024
const MAX_ENTRIES = 20_000
const MAX_COMPRESSION_RATIO = 100
const MANIFEST_PATH = 'package/package.json'

export interface InspectedPlugin {
  readonly digest: string
  readonly packageName: string
  readonly version: string
  readonly bundlePatch: string
}

interface PackageJson {
  name?: unknown
  version?: unknown
  main?: unknown
  exports?: unknown
  dependencies?: unknown
  optionalDependencies?: unknown
  dsh?: { bundle?: { patch?: unknown }; client?: unknown }
}

function managerError(code: ConstructorParameters<typeof PluginManagerError>[0], message: string, cause?: unknown) {
  return new PluginManagerError(code, message, cause === undefined ? undefined : { cause })
}

function normalizePackagePath(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) {
    throw managerError('PACKAGE_INVALID', `${field} must be a relative package path`)
  }
  const stripped = value.startsWith('./') ? value.slice(2) : value
  if (stripped.length === 0 || stripped.startsWith('/') || posix.normalize(stripped) !== stripped || stripped.startsWith('../')) {
    throw managerError('PACKAGE_INVALID', `${field} must stay inside the package`)
  }
  return stripped
}

function validatePackageName(value: unknown): string {
  if (typeof value !== 'string' || value.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u.test(value)) {
    throw managerError('PACKAGE_INVALID', 'package name is invalid')
  }
  return value
}

function validateDependencies(manifest: PackageJson): void {
  for (const field of ['dependencies', 'optionalDependencies'] as const) {
    const dependencies = manifest[field]
    if (dependencies === undefined) continue
    if (dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
      throw managerError('PACKAGE_INVALID', `${field} must be an object`)
    }
    for (const spec of Object.values(dependencies)) {
      if (typeof spec !== 'string') throw managerError('PACKAGE_INVALID', `${field} values must be strings`)
      if (/^(?:file|link|workspace):/u.test(spec) || /^\.{1,2}(?:[/\\]|$)/u.test(spec)) {
        throw managerError('PACKAGE_DEPENDENCY_UNSAFE', `${field} contains a local dependency`)
      }
    }
  }
}

function requiredEntrypoints(manifest: PackageJson): string[] {
  const paths: string[] = []
  if (manifest.main !== undefined) paths.push(normalizePackagePath(manifest.main, 'main'))
  const client = manifest.dsh?.client
  if (client !== undefined) {
    const exportValue = manifest.exports && typeof manifest.exports === 'object'
      ? (manifest.exports as Record<string, unknown>)['./client']
      : undefined
    const clientPath = typeof exportValue === 'string'
      ? exportValue
      : exportValue && typeof exportValue === 'object'
        ? (exportValue as Record<string, unknown>).default
        : undefined
    paths.push(normalizePackagePath(clientPath, 'exports["./client"]'))
  }
  return paths
}

export async function inspectPluginArchive(path: string): Promise<InspectedPlugin> {
  const compressed = (await stat(path)).size
  if (compressed <= 0 || compressed > MAX_COMPRESSED_BYTES) {
    throw managerError('ARCHIVE_INVALID', 'archive size is outside the supported range')
  }

  const digest = createHash('sha256')
  const names = new Set<string>()
  let entries = 0
  let expanded = 0
  let manifestBytes: Buffer | undefined
  const unpack = extract()

  const completed = new Promise<void>((resolve, reject) => {
    unpack.on('entry', (header, stream, next) => {
      void (async () => {
        entries += 1
        const name = header.name
        if (entries > MAX_ENTRIES) throw managerError('ARCHIVE_INVALID', 'archive has too many entries')
        if (header.type !== 'file' && header.type !== 'directory') {
          throw managerError('ARCHIVE_UNSAFE_ENTRY', 'archive contains a special entry')
        }
        if (name.startsWith('/') || name.includes('\\') || posix.normalize(name) !== name
          || name === 'package/..' || name.startsWith('package/../') || !name.startsWith('package/')) {
          throw managerError('ARCHIVE_UNSAFE_ENTRY', 'archive entry escapes the package root')
        }
        if (names.has(name)) throw managerError('ARCHIVE_UNSAFE_ENTRY', 'archive contains a duplicate entry')
        names.add(name)
        const chunks: Buffer[] = []
        let entryBytes = 0
        for await (const chunk of stream) {
          const bytes = Buffer.from(chunk)
          entryBytes += bytes.length
          expanded += bytes.length
          if (entryBytes > MAX_ENTRY_BYTES || expanded > MAX_EXPANDED_BYTES
            || expanded > compressed * MAX_COMPRESSION_RATIO) {
            throw managerError('ARCHIVE_INVALID', 'archive expands beyond the supported limits')
          }
          if (name === MANIFEST_PATH) chunks.push(bytes)
        }
        if (name === MANIFEST_PATH) manifestBytes = Buffer.concat(chunks)
        next()
      })().catch(reject)
    })
    unpack.once('finish', resolve)
    unpack.once('error', reject)
  })

  const source = createReadStream(path)
  source.on('data', chunk => digest.update(chunk))
  const gunzip = createGunzip()
  source.on('error', error => unpack.destroy(error))
  gunzip.on('error', error => unpack.destroy(error))
  source.pipe(gunzip).pipe(unpack)
  try {
    await completed
  } catch (error) {
    source.destroy()
    gunzip.destroy()
    unpack.destroy()
    if (error instanceof PluginManagerError) throw error
    throw managerError('ARCHIVE_INVALID', 'archive is not a valid tgz package', error)
  }

  if (manifestBytes === undefined) throw managerError('PACKAGE_INCOMPLETE', 'package.json is missing')
  let manifest: PackageJson
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8')) as PackageJson
  } catch (error) {
    throw managerError('PACKAGE_INVALID', 'package.json is invalid JSON', error)
  }
  const packageName = validatePackageName(manifest.name)
  if (typeof manifest.version !== 'string' || !semver.valid(manifest.version)) {
    throw managerError('PACKAGE_INVALID', 'package version is invalid')
  }
  const bundlePatch = normalizePackagePath(manifest.dsh?.bundle?.patch, 'dsh.bundle.patch')
  validateDependencies(manifest)
  for (const required of [bundlePatch, ...requiredEntrypoints(manifest)]) {
    if (!names.has(`package/${required}`)) {
      throw managerError('PACKAGE_INCOMPLETE', `declared package file is missing: ${required}`)
    }
  }
  return { digest: digest.digest('hex'), packageName, version: manifest.version, bundlePatch }
}
