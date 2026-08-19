import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { auditPackageArchive } from './release-audit.mjs'
import { buildHermeticEnvironment } from './release-env.mjs'

const script = fileURLToPath(import.meta.url)
const mailRoot = resolve(dirname(script), '..')
const repositoryRoot = resolve(mailRoot, '../..')

export function readPackageVersion(path = join(mailRoot, 'package.json')) {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (manifest.name !== 'dsh-mail') throw new Error(`mail release: expected package name dsh-mail, received ${String(manifest.name)}`)
  if (typeof manifest.version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(manifest.version)) {
    throw new Error(`mail release: invalid package version ${String(manifest.version)}`)
  }
  return manifest.version
}

export function publishArchive(stagedArchive, finalArchive, operations = {}) {
  const pendingArchive = `${finalArchive}.pending-${process.pid}`
  const copy = operations.copy ?? copyFileSync
  const rename = operations.rename ?? renameSync
  const remove = operations.remove ?? rmSync
  try {
    copy(stagedArchive, pendingArchive)
    rename(pendingArchive, finalArchive)
  } finally {
    remove(pendingArchive, { force: true })
  }
}

function copyPackage(source, destination) {
  cpSync(source, destination, {
    recursive: true,
    filter(path) {
      const relative = path.slice(source.length).replace(/^\//u, '')
      if (relative.split('/').includes('node_modules')) return false
      if (/^dsh-mail(?:-plugin)?-.*\.tgz$/u.test(relative)) return false
      return true
    },
  })
}

function runPnpm(pnpm, cwd, env, args) {
  const result = spawnSync(process.execPath, [pnpm, ...args], { cwd, env, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`mail release: pnpm ${args.join(' ')} failed with status ${String(result.status)}`)
}

export function packRelease({ pnpm, destination }) {
  if (typeof pnpm !== 'string' || pnpm === '') throw new Error('mail release: --pnpm is required')
  const pnpmPath = resolve(pnpm)
  const outputDirectory = resolve(destination)
  const version = readPackageVersion()
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-mail-release-'))
  const stagedMail = join(temporary, 'repo/plugins/mail')
  const stagedSeam = join(temporary, 'repo/packages/mail/mail')
  const productionMail = join(temporary, 'production')
  const packDestination = join(temporary, 'packed')
  const environmentRoot = join(temporary, 'environment')
  try {
    copyPackage(mailRoot, stagedMail)
    copyPackage(join(repositoryRoot, 'packages/mail/mail'), stagedSeam)
    mkdirSync(packDestination, { recursive: true })
    const env = buildHermeticEnvironment({
      root: environmentRoot,
      dshHome: join(environmentRoot, 'dsh'),
      nodeBin: dirname(process.execPath),
      packageBin: dirname(pnpmPath),
      offline: false,
      storeDir: join(environmentRoot, 'store'),
    })
    const installArgs = ['install', '--frozen-lockfile', '--ignore-scripts', '--config.node-linker=hoisted', '--config.auto-install-peers=false']
    runPnpm(pnpmPath, stagedMail, env, installArgs)
    runPnpm(pnpmPath, stagedMail, env, ['run', 'build'])
    const offlineEnv = { ...env, npm_config_offline: 'true' }
    runPnpm(pnpmPath, stagedMail, offlineEnv, [
      '--config.inject-workspace-packages=true', '--config.node-linker=hoisted', '--filter', 'dsh-mail',
      'deploy', '--prod', productionMail,
    ])
    // Build ran explicitly. Remove pack lifecycle hooks in the disposable
    // production deployment so packing cannot rebuild or install.
    const stagedManifestPath = join(productionMail, 'package.json')
    const stagedManifest = JSON.parse(readFileSync(stagedManifestPath, 'utf8'))
    for (const lifecycle of ['prepack', 'prepare', 'prepublishOnly', 'postpack']) delete stagedManifest.scripts?.[lifecycle]
    writeFileSync(stagedManifestPath, `${JSON.stringify(stagedManifest, undefined, 2)}\n`)
    runPnpm(pnpmPath, productionMail, offlineEnv, ['--config.node-linker=hoisted', 'pack', '--pack-destination', packDestination])
    const expectedName = `dsh-mail-${version}.tgz`
    const archives = readdirSync(packDestination).filter(name => name.endsWith('.tgz'))
    if (archives.length !== 1 || archives[0] !== expectedName) {
      throw new Error(`mail release: expected only ${expectedName}, received ${archives.join(', ') || '(none)'}`)
    }
    const stagedArchive = join(packDestination, expectedName)
    auditPackageArchive(stagedArchive)
    const finalArchive = resolve(outputDirectory, expectedName)
    publishArchive(stagedArchive, finalArchive)
    return finalArchive
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

if (resolve(process.argv[1] ?? '') === script) {
  if (process.argv.includes('--version')) {
    process.stdout.write(`${readPackageVersion()}\n`)
  } else {
    const archive = packRelease({ pnpm: argument('--pnpm'), destination: argument('--destination') ?? mailRoot })
    process.stdout.write(`${archive}\n`)
  }
}
