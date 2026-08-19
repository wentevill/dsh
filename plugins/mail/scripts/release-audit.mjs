import { gunzipSync } from 'node:zlib'
import { posix } from 'node:path'
import { readFileSync } from 'node:fs'

const BLOCK = 512

function tarText(buffer, offset, length) {
  return buffer.subarray(offset, offset + length).toString('utf8').replace(/\0.*$/su, '').trim()
}

function tarSize(buffer, offset) {
  const value = tarText(buffer, offset + 124, 12)
  if (!/^[0-7]*$/u.test(value)) throw new Error(`package audit: invalid tar size for entry at ${offset}`)
  return value === '' ? 0 : Number.parseInt(value, 8)
}

function paxFields(content) {
  const fields = {}
  let offset = 0
  while (offset < content.length) {
    const space = content.indexOf(0x20, offset)
    if (space < 0) throw new Error('package audit: malformed PAX record')
    const length = Number(content.subarray(offset, space).toString('ascii'))
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > content.length) {
      throw new Error('package audit: invalid PAX record length')
    }
    const record = content.subarray(space + 1, offset + length - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals > 0) fields[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return fields
}

/** Parse the npm tgz without extracting links or trusting archive paths. */
export function readPackageArchive(archive) {
  const tar = gunzipSync(readFileSync(archive))
  const entries = []
  let globalPax = {}
  let nextPax = {}
  for (let offset = 0; offset + BLOCK <= tar.length;) {
    const header = tar.subarray(offset, offset + BLOCK)
    if (header.every(byte => byte === 0)) break
    const size = tarSize(tar, offset)
    const bodyStart = offset + BLOCK
    const bodyEnd = bodyStart + size
    if (bodyEnd > tar.length) throw new Error('package audit: truncated tar entry')
    const prefix = tarText(header, 345, 155)
    const baseName = tarText(header, 0, 100)
    const headerPath = prefix === '' ? baseName : `${prefix}/${baseName}`
    const typeFlag = String.fromCharCode(header[156] ?? 0)
    const content = tar.subarray(bodyStart, bodyEnd)
    offset = bodyStart + Math.ceil(size / BLOCK) * BLOCK

    if (typeFlag === 'g') {
      globalPax = { ...globalPax, ...paxFields(content) }
      continue
    }
    if (typeFlag === 'x') {
      nextPax = paxFields(content)
      continue
    }
    const pax = { ...globalPax, ...nextPax }
    nextPax = {}
    const path = pax.path ?? headerPath
    const linkPath = pax.linkpath ?? tarText(header, 157, 100)
    const type = typeFlag === '1' ? 'hardlink'
      : typeFlag === '2' ? 'symlink'
      : typeFlag === '5' ? 'directory'
      : (typeFlag === '\0' || typeFlag === '0' || typeFlag === '') ? 'file'
      : 'unsupported'
    entries.push({ path, type, ...(type === 'file' ? { content: Buffer.from(content) } : {}), ...(linkPath === '' ? {} : { linkPath }) })
  }
  return entries
}

function safeArchivePath(path) {
  if (typeof path !== 'string' || path === '' || /^(?:\/|[A-Za-z]:[\\/])/u.test(path)) return false
  const parts = path.replace(/[\\/]+$/u, '').split(/[\\/]+/u)
  return !parts.includes('..') && !parts.includes('')
}

function isInstalledPackageManifest(path) {
  return /^package\/(?:node_modules\/(?:@[^/]+\/[^/]+|[^/]+)\/)+package\.json$/u.test(path)
}

function dependencyMap(manifest, key) {
  const value = manifest[key]
  if (value === undefined) return {}
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`package audit: ${String(manifest.name ?? '(unnamed)')} has invalid ${key}`)
  }
  return value
}

function rejectLocalSpecs(manifest) {
  for (const key of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(dependencyMap(manifest, key))) {
      if (typeof spec !== 'string') throw new Error(`package audit: invalid dependency spec for ${name}`)
      if (/^(?:workspace:|link:|file:|portal:|\/|[A-Za-z]:[\\/])/u.test(spec)) {
        throw new Error(`package audit: ${String(manifest.name ?? '(unnamed)')} contains local/workspace dependency ${name}: ${spec}`)
      }
    }
  }
}

function resolveDependencyManifest(manifests, fromDirectory, name) {
  let current = fromDirectory
  while (current === 'package' || current.startsWith('package/')) {
    if (posix.basename(current) !== 'node_modules') {
      const candidate = posix.join(current, 'node_modules', name, 'package.json')
      if (manifests.has(candidate)) return candidate
    }
    if (current === 'package') break
    current = posix.dirname(current)
  }
  return undefined
}

/** Audit archive entries as an exact hoisted production dependency closure. */
export function auditPackageEntries(entries) {
  const manifests = new Map()
  for (const entry of entries) {
    if (!safeArchivePath(entry.path)) throw new Error(`package audit: unsafe archive path ${String(entry.path)}`)
    if (entry.type === 'symlink' || entry.type === 'hardlink') {
      throw new Error(`package audit: tar link is forbidden: ${entry.path}`)
    }
    if (entry.type === 'unsupported') throw new Error(`package audit: unsupported tar entry: ${entry.path}`)
    if (entry.type !== 'file' || !entry.path.endsWith('/package.json')) continue
    let manifest
    try {
      manifest = JSON.parse(entry.content.toString('utf8'))
    } catch {
      throw new Error(`package audit: invalid package manifest ${entry.path}`)
    }
    rejectLocalSpecs(manifest)
    manifests.set(entry.path, manifest)
  }

  const rootPath = 'package/package.json'
  const rootManifest = manifests.get(rootPath)
  if (rootManifest === undefined) throw new Error('package audit: package/package.json is missing')
  const reachable = new Set([rootPath])
  const queue = [rootPath]
  while (queue.length > 0) {
    const manifestPath = queue.shift()
    const manifest = manifests.get(manifestPath)
    const directory = posix.dirname(manifestPath)
    for (const [name] of Object.entries(dependencyMap(manifest, 'dependencies'))) {
      const resolved = resolveDependencyManifest(manifests, directory, name)
      if (resolved === undefined) {
        throw new Error(`package audit: missing production dependency ${name} required by ${String(manifest.name ?? manifestPath)}`)
      }
      if (!reachable.has(resolved)) {
        reachable.add(resolved)
        queue.push(resolved)
      }
    }
    for (const [name] of Object.entries(dependencyMap(manifest, 'optionalDependencies'))) {
      const resolved = resolveDependencyManifest(manifests, directory, name)
      if (resolved !== undefined && !reachable.has(resolved)) {
        reachable.add(resolved)
        queue.push(resolved)
      }
    }
  }

  const unreachable = [...manifests]
    .filter(([path]) => isInstalledPackageManifest(path) && !reachable.has(path))
    .map(([path, manifest]) => String(manifest.name ?? path))
    .sort()
  if (unreachable.length > 0) {
    throw new Error(`package audit: dev-only or unreachable package manifests: ${unreachable.join(', ')}`)
  }

  const productionPackages = [...reachable]
    .filter(path => path !== rootPath)
    .map(path => String(manifests.get(path)?.name ?? path))
    .sort()
  return { productionPackages }
}

export function auditPackageArchive(archive) {
  return auditPackageEntries(readPackageArchive(archive))
}
