import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const FORBIDDEN_TEXT = [/pnpm-store/, /["']@deepseek-ai\/dsh\/src\//m]
const TEXT_EXTENSIONS = new Set(['.js', '.json', '.yml', '.yaml', '.txt', '.md', '.cjs', '.mjs'])

export function auditRuntime(root: string): void {
  const node = join(root, 'node/bin/node')
  const cli = join(root, 'app/node_modules/@deepseek-ai/dsh/lib/bin.js')
  const pnpm = join(root, 'app/node_modules/pnpm/bin/pnpm.cjs')
  const pnpmShim = join(root, 'app/node_modules/.bin/pnpm')
  for (const required of [node, cli, pnpm, pnpmShim]) {
    if (!lstatSync(required, { throwIfNoEntry: false })?.isFile()) throw new Error(`Missing runtime artifact: ${relative(root, required)}`)
  }
  for (const sourceDirectory of ['src', 'scripts', 'tests', 'src-tauri']) {
    const path = join(root, 'app', sourceDirectory)
    if (lstatSync(path, { throwIfNoEntry: false })) throw new Error(`Runtime contains Desktop source: app/${sourceDirectory}`)
  }
  const web = findFile(join(root, 'app/node_modules'), path => path.endsWith('/@deepseek-ai/dsh-web-frontend/dist/index.html'))
  if (!web) throw new Error('Missing runtime artifact: @deepseek-ai/dsh-web-frontend/dist/index.html')
  const virtualStore = join(root, 'app/node_modules/.pnpm')
  if (lstatSync(virtualStore, { throwIfNoEntry: false })?.isDirectory()
    && readdirSync(virtualStore).some(name => name === 'tsx' || name.startsWith('tsx@'))) {
    throw new Error('Runtime contains development package: tsx')
  }
  const arch = execFileSync(node, ['-p', 'process.arch'], { encoding: 'utf8' }).trim()
  if (arch !== 'arm64') throw new Error(`Bundled Node architecture must be arm64, got ${arch}`)
  const pnpmVersion = execFileSync(node, [pnpm, '--version'], { encoding: 'utf8' }).trim()
  if (pnpmVersion !== '11.7.0') throw new Error(`Bundled pnpm version must be 11.7.0, got ${pnpmVersion}`)
  const nodeModules = join(root, 'app/node_modules')
  validateRuntimeDependencies(nodeModules, nodeModules)
  walk(root, root)
}

function validateRuntimeDependencies(nodeModules: string, directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name === '.pnpm') continue
    const path = join(directory, entry.name)
    const manifestPath = join(path, 'package.json')
    if (lstatSync(manifestPath, { throwIfNoEntry: false })?.isFile()) {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name?: string
        dependencies?: Record<string, string>
        peerDependencies?: Record<string, string>
        peerDependenciesMeta?: Record<string, { optional?: boolean }>
      }
      const requiredPeers = Object.fromEntries(Object.entries(manifest.peerDependencies ?? {})
        .filter(([dependency]) => !manifest.peerDependenciesMeta?.[dependency]?.optional))
      for (const [dependency, version] of Object.entries({ ...manifest.dependencies, ...requiredPeers })) {
        if (!version.startsWith('workspace:')) continue
        if (!lstatSync(join(nodeModules, ...dependency.split('/')), { throwIfNoEntry: false })?.isDirectory()) {
          throw new Error(`Unresolvable runtime dependency: ${manifest.name ?? relative(directory, path)} -> ${dependency}`)
        }
      }
    }
    validateRuntimeDependencies(nodeModules, path)
  }
}

function walk(root: string, directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const stat = lstatSync(path)
    if (stat.isSymbolicLink()) {
      throw new Error(`Runtime contains non-portable symlink: ${relative(root, path)}`)
    }
    if (stat.isDirectory()) {
      walk(root, path)
      continue
    }
    const extension = extname(entry.name)
    if (!TEXT_EXTENSIONS.has(extension) || stat.size > 2 * 1024 * 1024) continue
    const text = readFileSync(path, 'utf8')
    if (text.includes(resolve('.'))) throw new Error(`Development workspace path in ${relative(root, path)}`)
    const forbidden = FORBIDDEN_TEXT.find(pattern => pattern.test(text))
    if (forbidden) throw new Error(`Forbidden development reference in ${relative(root, path)}: ${forbidden}`)
  }
}

function findFile(directory: string, predicate: (path: string) => boolean): string | undefined {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(path, predicate)
      if (found) return found
    } else if (predicate(path)) return path
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  auditRuntime(resolve(process.argv[2] ?? 'apps/desktop/src-tauri/resources/runtime'))
}
