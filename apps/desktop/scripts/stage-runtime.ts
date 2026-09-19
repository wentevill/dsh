import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
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
export type RuntimeCommandInDirectoryRunner = (command: string, args: string[], cwd: string) => void

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
    patchLegacyTypertCompatibility(join(staged, 'app'))
    installStagedRuntime(staged, destination)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

const TYPERT_COMPATIBILITY_TARGETS = [
  '@deepseek-ai/dsh-typert-loader/lib/index.js',
  '@deepseek-ai/dsh-typert-registry/lib/index.js',
  '@deepseek-ai/dsh-typert-registry/lib/client.js',
] as const

/** Accept pre-v0.1.6 generated Typert manifests that expose eager `schema` values. */
export function patchLegacyTypertCompatibility(appRoot: string): void {
  for (const target of TYPERT_COMPATIBILITY_TARGETS) {
    const path = join(appRoot, 'node_modules', target)
    let source = readFileSync(path, 'utf8')
    let schemas = 0
    let codecs = 0
    source = source.replace(
      /if \(typeof schema\.create !== "function"\) throw new Error\(([^;\n]+)\);/gu,
      (_match, error: string) => {
        schemas += 1
        return `if (typeof schema.create !== "function") {\n\t\t\tconst legacySchema = schema.schema;\n\t\t\tif (legacySchema === void 0) throw new Error(${error});\n\t\t\tschema.create = () => legacySchema;\n\t\t}`
      },
    )
    source = source.replace(
      /if \(typeof codec\.create !== "function"\) throw new Error\(([^;\n]+)\);/gu,
      (_match, error: string) => {
        codecs += 1
        return `if (typeof codec.create !== "function") {\n\t\tconst legacySchema = codec.schema;\n\t\tif (legacySchema === void 0) throw new Error(${error});\n\t\tcodec.create = () => legacySchema;\n\t}`
      },
    )
    if (schemas === 0 || codecs === 0) {
      throw new Error(`Typert compatibility anchors are missing from ${target}`)
    }
    writeFileSync(path, source)
  }
}

export function installStagedRuntime(staged: string, destination: string): void {
  rmSync(destination, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  renameSync(staged, destination)
}

/** Make Desktop-only capabilities part of the installed dsh closure used by profile peer fallback. */
export function augmentDesktopRuntimeClosure(assembly: string): void {
  const cliPath = join(assembly, 'apps/cli/package.json')
  const desktopPath = join(assembly, 'apps/desktop/package.json')
  const workspacePath = join(assembly, 'pnpm-workspace.yaml')
  const tsdownPath = join(assembly, 'tsdown.config.ts')
  const cli = JSON.parse(readFileSync(cliPath, 'utf8')) as { dependencies?: Record<string, string> }
  const desktop = JSON.parse(readFileSync(desktopPath, 'utf8')) as { dependencies?: Record<string, string> }
  const additions = Object.fromEntries(Object.entries(desktop.dependencies ?? {})
    .filter(([name, version]) => !['@deepseek-ai/dsh', 'dsh-plugin-manager', 'pnpm'].includes(name) && version.startsWith('workspace:')))
  cli.dependencies = { ...cli.dependencies, ...additions }
  writeFileSync(cliPath, JSON.stringify(cli, undefined, 2) + '\n')
  const workspace = readFileSync(workspacePath, 'utf8')
  writeFileSync(workspacePath, workspace.replace(
    /^  '@electron\/osx-sign@1\.3\.3': patches\/@electron__osx-sign@1\.3\.3\.patch\n/m,
    '',
  ))
  const tsdown = readFileSync(tsdownPath, 'utf8')
  writeFileSync(tsdownPath, tsdown.replace(
    ", 'apps/desktop', 'apps/desktop-host'",
    ", 'apps/desktop-host'",
  ))
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
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, {
    recursive: true,
    filter: path => !path.split('/').some(segment => ['node_modules', 'target', 'resources'].includes(segment)),
  })
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
      removeRuntimeLink(link.path)
      continue
    }
    if (!link.target.startsWith(`${resolve(workspaceRoot)}/`)) continue
    if (lstatSync(link.target).isFile()) {
      removeRuntimeLink(link.path)
      copyFileSync(link.target, link.path)
      continue
    }
    if (!lstatSync(join(link.target, 'package.json'), { throwIfNoEntry: false })?.isFile()) {
      throw new Error(`External runtime link has no package manifest: ${link.target}`)
    }
    const manifest = JSON.parse(readFileSync(join(link.target, 'package.json'), 'utf8')) as { os?: string[] }
    if (manifest.os && !manifest.os.includes('darwin')) {
      removeRuntimeLink(link.path)
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
    removeRuntimeLink(link.path)
    symlinkSync(relative(dirname(link.path), packaged), link.path, 'dir')
  }
}

/** Remove a deployed package link without following a directory symlink. */
export function removeRuntimeLink(path: string): void {
  if (!lstatSync(path).isSymbolicLink()) throw new Error(`Expected runtime link: ${path}`)
  unlinkSync(path)
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
