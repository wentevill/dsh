import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, delimiter, dirname, extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface RuntimeConfig {
  nodeVersion: string
  archive: string
  url: string
  sha256: string
  pnpmVersion: string
  pnpmIntegrity: string
}

export type RuntimeCommandRunner = (command: string, args: string[]) => void

export function signRuntimeExecutable(
  path: string,
  run: RuntimeCommandRunner = (command, args) => execFileSync(command, args, { stdio: 'inherit' }),
): void {
  run('codesign', ['--force', '--sign', '-', path])
}

export function verifySha256(path: string, expected: string): void {
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (actual !== expected) throw new Error(`Node archive checksum mismatch: expected ${expected}, got ${actual}`)
}

export function verifyPackageIntegrity(lockPath: string, name: string, version: string, expected: string): void {
  const lock = readFileSync(lockPath, 'utf8')
  const escaped = `${name}@${version}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const entry = lock.match(new RegExp(`^  ${escaped}:\\n((?: {4}.*\\n)+)`, 'm'))?.[1] ?? ''
  if (!entry.includes(`resolution: {integrity: ${expected}}`)) {
    throw new Error(`${name}@${version} lockfile integrity mismatch`)
  }
}

/** Export only tracked files from the pinned upstream commit into a writable assembly tree. */
export function createAssemblySource(upstreamRoot: string, destination: string): void {
  const archive = join(dirname(destination), `.dsh-upstream-${process.pid}.tar`)
  mkdirSync(destination, { recursive: true })
  try {
    execFileSync('git', ['-C', upstreamRoot, 'archive', '--format=tar', `--output=${archive}`, 'HEAD'])
    execFileSync('tar', ['-xf', archive, '-C', destination])
  } finally {
    rmSync(archive, { force: true })
  }
}

export function stageRuntime(
  archivePath: string,
  upstreamRoot: string,
  packagingRoot: string,
  destination: string,
  config: RuntimeConfig,
): void {
  verifySha256(archivePath, config.sha256)
  const temporary = createStageDirectory(destination, dirname(packagingRoot))
  try {
    const extract = join(temporary, 'extract')
    const staged = join(temporary, 'runtime')
    const deploy = join(temporary, 'deploy')
    const assembly = join(temporary, 'source')
    mkdirSync(join(staged, 'node', 'bin'), { recursive: true })
    mkdirSync(extract)
    execFileSync('tar', ['-xzf', archivePath, '-C', extract])
    const node = join(extract, basename(config.archive, '.tar.gz'), 'bin', 'node')
    const upstreamCommit = execFileSync('git', ['-C', upstreamRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const environment = buildEnvironment(node, upstreamCommit, process.env)
    copyFileSync(node, join(staged, 'node', 'bin', 'node'))
    chmodSync(join(staged, 'node', 'bin', 'node'), 0o755)
    signRuntimeExecutable(join(staged, 'node', 'bin', 'node'))
    createAssemblySource(upstreamRoot, assembly)
    execFileSync('corepack', ['pnpm', 'install', '--frozen-lockfile'], { cwd: assembly, env: environment, stdio: 'inherit' })
    execFileSync('corepack', ['pnpm', 'build'], { cwd: assembly, env: environment, stdio: 'inherit' })
    // The private packages are overlaid after the pristine upstream build.
    // A second install updates only this disposable assembly's lock and links.
    copyPackagingPackage(join(packagingRoot, 'apps/desktop'), join(assembly, 'apps/desktop'))
    copyPackagingPackage(join(packagingRoot, 'packages/mail'), join(assembly, 'packages/mail'))
    copyPluginManagerPackage(join(packagingRoot, 'plugins/manager'), join(assembly, 'packages/extensions/plugin-manager'))
    augmentDesktopRuntimeClosure(assembly)
    execFileSync('corepack', ['pnpm', 'install', '--lockfile-only', '--no-frozen-lockfile'], { cwd: assembly, env: environment, stdio: 'inherit' })
    verifyPackageIntegrity(join(assembly, 'pnpm-lock.yaml'), 'pnpm', config.pnpmVersion, config.pnpmIntegrity)
    execFileSync('corepack', ['pnpm', 'install', '--frozen-lockfile'], { cwd: assembly, env: environment, stdio: 'inherit' })
    execFileSync('corepack', ['pnpm', 'exec', 'tsc', '-b', 'packages/mail/mail/tsconfig.json'], {
      cwd: assembly,
      env: environment,
      stdio: 'inherit',
    })
    execFileSync('corepack', ['pnpm', 'exec', 'tsdown', '--env.DSH_BUILD_FACE', 'host'], {
      cwd: assembly,
      env: environment,
      stdio: 'inherit',
    })
    execFileSync('corepack', [
      'pnpm', '--filter', '@deepseek-ai/dsh-desktop',
      'deploy', '--prod', '--legacy', '--config.node-linker=hoisted',
      '--config.auto-install-peers=false', '--config.link-workspace-packages=true', deploy,
    ], { cwd: assembly, env: environment, stdio: 'inherit' })
    materializeExternalPackages(join(deploy, 'node_modules'), assembly, temporary, environment)
    materializeRuntimeLinks(join(deploy, 'node_modules'))
    breakRuntimeHardlinks(join(deploy, 'node_modules'))
    sanitizeWorkspacePaths(join(deploy, 'node_modules'), resolve(assembly))
    rmSync(join(deploy, 'node_modules/.modules.yaml'), { force: true })
    rmSync(join(deploy, 'node_modules/.pnpm/lock.yaml'), { force: true })
    mkdirSync(join(staged, 'app'))
    renameSync(join(deploy, 'node_modules'), join(staged, 'app', 'node_modules'))
    stagePluginManagerAssets(
      join(assembly, 'packages/extensions/plugin-manager'),
      join(packagingRoot, 'apps/desktop/scripts/ensure-plugin-manager.mjs'),
      staged,
      (source, destination) => {
        packPluginManagerPackage(source, destination, (command, args) => {
          execFileSync(command, args, { cwd: source, env: environment, stdio: 'inherit' })
        })
      },
    )
    rmSync(destination, { recursive: true, force: true })
    renameSync(staged, destination)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

export type PluginManagerPackRunner = (source: string, destination: string) => void

export function packPluginManagerPackage(
  source: string,
  destination: string,
  run: RuntimeCommandRunner = (command, args) => execFileSync(command, args, { cwd: source, stdio: 'inherit' }),
): void {
  run('corepack', ['pnpm', '--config.ignore-scripts=true', 'pack', '--pack-destination', destination])
}

export function stagePluginManagerAssets(
  managerRoot: string,
  bootstrapPath: string,
  staged: string,
  pack: PluginManagerPackRunner,
): void {
  const plugins = join(staged, 'plugins')
  const app = join(staged, 'app')
  mkdirSync(plugins, { recursive: true })
  mkdirSync(app, { recursive: true })
  pack(managerRoot, plugins)
  const archives = readdirSync(plugins).filter(name => /^dsh-plugin-manager-.+\.tgz$/u.test(name))
  if (archives.length !== 1) {
    throw new Error(`Plugin manager pack produced ${archives.length} archives`)
  }
  renameSync(join(plugins, archives[0]!), join(plugins, 'dsh-plugin-manager.tgz'))
  copyFileSync(bootstrapPath, join(app, 'ensure-plugin-manager.mjs'))
}

/** Make Desktop-only capabilities part of the installed dsh closure used by profile peer fallback. */
export function augmentDesktopRuntimeClosure(assembly: string): void {
  const cliPath = join(assembly, 'apps/cli/package.json')
  const desktopPath = join(assembly, 'apps/desktop/package.json')
  const cli = JSON.parse(readFileSync(cliPath, 'utf8')) as { dependencies?: Record<string, string> }
  const desktop = JSON.parse(readFileSync(desktopPath, 'utf8')) as { dependencies?: Record<string, string> }
  const additions = Object.fromEntries(Object.entries(desktop.dependencies ?? {})
    .filter(([name, version]) => name !== '@deepseek-ai/dsh' && name !== 'pnpm' && version.startsWith('workspace:')))
  cli.dependencies = { ...cli.dependencies, ...additions }
  writeFileSync(cliPath, JSON.stringify(cli, undefined, 2) + '\n')
}

export function createStageDirectory(destination: string, stagingParent: string): string {
  mkdirSync(dirname(destination), { recursive: true })
  mkdirSync(stagingParent, { recursive: true })
  return mkdtempSync(join(stagingParent, '.runtime-stage-'))
}

export function buildEnvironment(
  node: string,
  upstreamCommit: string,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const nodeBin = dirname(node)
  return {
    ...inherited,
    DSH_CLIENT_COMMIT_HASH: upstreamCommit,
    PATH: inherited.PATH ? `${nodeBin}${delimiter}${inherited.PATH}` : nodeBin,
  }
}

function copyPackagingPackage(source: string, destination: string): void {
  cpSync(source, destination, {
    recursive: true,
    filter: path => !path.split('/').some(segment => ['node_modules', 'target', 'resources'].includes(segment)),
  })
}

export function copyPluginManagerPackage(source: string, destination: string): void {
  copyPackagingPackage(source, destination)
  const configPath = join(destination, 'tsconfig.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as { extends?: string }
  if (config.extends === '../../tsconfig.base.json') config.extends = '../../../tsconfig.base.json'
  writeFileSync(configPath, JSON.stringify(config, undefined, 2) + '\n')
}

export function materializeRuntimeLinks(nodeModules: string): void {
  const links: string[] = []
  collectRuntimeLinks(nodeModules, links)
  for (const link of links) {
    const target = realpathSync(link)
    const metadata = lstatSync(target)
    rmSync(link, { recursive: true, force: true })
    if (resolve(link) === resolve(nodeModules, '.bin/pnpm')) {
      writeFileSync(link, "#!/usr/bin/env node\nimport '../pnpm/bin/pnpm.cjs'\n", { mode: 0o755 })
      continue
    }
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

function materializeExternalPackages(
  nodeModules: string,
  workspaceRoot: string,
  temporary: string,
  environment: NodeJS.ProcessEnv,
): void {
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
      execFileSync('corepack', ['pnpm', 'pack', '--pack-destination', packDirectory], {
        cwd: link.target,
        env: environment,
        stdio: 'pipe',
      })
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
  const packagingRoot = resolve(desktopRoot, '../..')
  const upstreamRoot = join(packagingRoot, 'upstream')
  const config = JSON.parse(readFileSync(join(desktopRoot, 'runtime.json'), 'utf8')) as RuntimeConfig
  const archiveFlag = process.argv.indexOf('--archive')
  const archive = process.argv[archiveFlag + 1]
  if (archiveFlag < 0 || !archive) throw new Error('usage: stage-runtime.ts --archive <node archive>')
  stageRuntime(resolve(archive), upstreamRoot, packagingRoot, join(desktopRoot, 'src-tauri/resources/runtime'), config)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
