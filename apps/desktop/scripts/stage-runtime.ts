import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RuntimeConfig {
  nodeVersion: string
  archive: string
  url: string
  sha256: string
}

export function verifySha256(path: string, expected: string): void {
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (actual !== expected) throw new Error(`Node archive checksum mismatch: expected ${expected}, got ${actual}`)
}

export function withPreservedFile(path: string, action: () => void): void {
  const original = readFileSync(path)
  try {
    action()
  } finally {
    writeFileSync(path, original)
  }
}

export function stageRuntime(archivePath: string, workspaceRoot: string, destination: string, config: RuntimeConfig): void {
  verifySha256(archivePath, config.sha256)
  const temporary = mkdtempSync(join(dirname(destination), '.runtime-stage-'))
  try {
    const extract = join(temporary, 'extract')
    const staged = join(temporary, 'runtime')
    const deploy = join(temporary, 'deploy')
    mkdirSync(join(staged, 'node', 'bin'), { recursive: true })
    mkdirSync(extract)
    execFileSync('tar', ['-xzf', archivePath, '-C', extract])
    const node = join(extract, basename(config.archive, '.tar.gz'), 'bin', 'node')
    copyFileSync(node, join(staged, 'node', 'bin', 'node'))
    chmodSync(join(staged, 'node', 'bin', 'node'), 0o755)
    withPreservedFile(join(workspaceRoot, 'pnpm-lock.yaml'), () => {
      execFileSync('corepack', [
        'pnpm', '--filter', '@deepseek-ai/dsh-desktop',
        'deploy', '--prod', '--legacy', '--config.node-linker=hoisted',
        '--config.auto-install-peers=false', '--config.link-workspace-packages=true', deploy,
      ], { cwd: workspaceRoot, stdio: 'inherit' })
    })
    materializeExternalPackages(join(deploy, 'node_modules'), workspaceRoot, temporary)
    materializeRuntimeLinks(join(deploy, 'node_modules'))
    breakRuntimeHardlinks(join(deploy, 'node_modules'))
    sanitizeWorkspacePaths(join(deploy, 'node_modules'), resolve(workspaceRoot))
    rmSync(join(deploy, 'node_modules/.modules.yaml'), { force: true })
    rmSync(join(deploy, 'node_modules/.pnpm/lock.yaml'), { force: true })
    mkdirSync(join(staged, 'app'))
    renameSync(join(deploy, 'node_modules'), join(staged, 'app', 'node_modules'))
    rmSync(destination, { recursive: true, force: true })
    renameSync(staged, destination)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

export function materializeRuntimeLinks(nodeModules: string): void {
  const links: string[] = []
  collectRuntimeLinks(nodeModules, links)
  for (const link of links) {
    const target = realpathSync(link)
    const metadata = lstatSync(target)
    rmSync(link, { recursive: true, force: true })
    if (metadata.isFile()) {
      copyFileSync(target, link)
      chmodSync(link, metadata.mode)
    } else {
      const nestedNodeModules = join(target, 'node_modules')
      cpSync(target, link, {
        recursive: true,
        dereference: true,
        filter: path => path !== nestedNodeModules && !path.startsWith(`${nestedNodeModules}/`),
      })
    }
  }
}

export function breakRuntimeHardlinks(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = lstatSync(path)
    if (metadata.isDirectory()) {
      breakRuntimeHardlinks(path)
      continue
    }
    if (!metadata.isFile() || metadata.nlink < 2) continue
    const copy = `${path}.dsh-copy-${process.pid}`
    try {
      copyFileSync(path, copy)
      chmodSync(copy, metadata.mode)
      renameSync(copy, path)
    } finally {
      rmSync(copy, { force: true })
    }
  }
}

function collectRuntimeLinks(directory: string, links: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (lstatSync(path).isSymbolicLink()) links.push(path)
    else if (entry.isDirectory()) collectRuntimeLinks(path, links)
  }
}

function sanitizeWorkspacePaths(directory: string, workspaceRoot: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (lstatSync(path).isSymbolicLink()) continue
    if (entry.isDirectory()) {
      sanitizeWorkspacePaths(path, workspaceRoot)
      continue
    }
    if (!new Set(['.js', '.json', '.yml', '.yaml', '.txt', '.md', '.cjs', '.mjs']).has(extname(path))) continue
    const text = readFileSync(path, 'utf8')
    if (text.includes(workspaceRoot)) writeFileSync(path, text.replaceAll(workspaceRoot, '/__dsh_build__'))
  }
}

function materializeExternalPackages(nodeModules: string, workspaceRoot: string, temporary: string): void {
  const links: Array<{ path: string; target: string }> = []
  collectLinks(nodeModules, links)
  const materialized = new Map<string, string>()
  const packageRoot = join(nodeModules, '.desktop-packages')
  for (const link of links) {
    if (link.target.startsWith(`${resolve(nodeModules)}/`)) continue
    if ([resolve(workspaceRoot, 'apps/desktop'), resolve(workspaceRoot, 'python/sdk-runtime')].includes(link.target)) {
      rmSync(link.path)
      continue
    }
    if (!link.target.startsWith(`${resolve(workspaceRoot)}/`)) continue
    if (lstatSync(link.target).isFile()) {
      rmSync(link.path)
      copyFileSync(link.target, link.path)
      continue
    }
    if (!lstatSync(join(link.target, 'package.json'), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`External runtime link has no package manifest: ${link.target}`)
    }
    const manifest = JSON.parse(readFileSync(join(link.target, 'package.json'), 'utf8')) as { os?: string[] }
    if (manifest.os && !manifest.os.includes('darwin')) {
      rmSync(link.path)
      continue
    }
    let packaged = materialized.get(link.target)
    if (!packaged) {
      const id = createHash('sha256').update(link.target).digest('hex').slice(0, 16)
      const packDirectory = join(temporary, `pack-${id}`)
      const extractDirectory = join(temporary, `extract-${id}`)
      mkdirSync(packDirectory)
      mkdirSync(extractDirectory)
      execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', packDirectory], { cwd: link.target, stdio: 'pipe' })
      const archive = readdirSync(packDirectory).find(name => name.endsWith('.tgz'))
      if (!archive) throw new Error(`pnpm pack produced no archive for ${link.target}`)
      execFileSync('tar', ['-xzf', join(packDirectory, archive), '-C', extractDirectory])
      mkdirSync(packageRoot, { recursive: true })
      packaged = join(packageRoot, id)
      renameSync(join(extractDirectory, 'package'), packaged)
      materialized.set(link.target, packaged)
    }
    rmSync(link.path)
    symlinkSync(relative(dirname(link.path), packaged), link.path, 'dir')
  }
}

function collectLinks(directory: string, links: Array<{ path: string; target: string }>): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (lstatSync(path).isSymbolicLink()) links.push({ path, target: realpathSync(path) })
    else if (entry.isDirectory()) collectLinks(path, links)
  }
}

function main(): void {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const workspaceRoot = resolve(desktopRoot, '../..')
  const config = JSON.parse(readFileSync(join(desktopRoot, 'runtime.json'), 'utf8')) as RuntimeConfig
  const archiveFlag = process.argv.indexOf('--archive')
  const archive = process.argv[archiveFlag + 1]
  if (archiveFlag < 0 || !archive) throw new Error('usage: stage-runtime.ts --archive <node archive>')
  stageRuntime(resolve(archive), workspaceRoot, join(desktopRoot, 'src-tauri/resources/runtime'), config)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
