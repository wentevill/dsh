import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export function managerNeedsInstall(bundledVersion, installedVersion) {
  return bundledVersion !== installedVersion
}

export function buildManagerInstallArgs(cli, archive) {
  return [cli, 'plugin', '--profile', 'web', 'add', '--ignore-scripts', archive]
}

function readVersion(path) {
  if (!existsSync(path)) return undefined
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  return typeof manifest.version === 'string' ? manifest.version : undefined
}

export function ensurePluginManager(options = {}) {
  const appRoot = options.appRoot ?? dirname(fileURLToPath(import.meta.url))
  const dshHome = options.dshHome ?? process.env.DSH_HOME
  if (!dshHome) throw new Error('plugin manager bootstrap requires DSH_HOME')
  const nodeModules = join(appRoot, 'node_modules')
  const bundledManifest = join(nodeModules, 'dsh-plugin-manager/package.json')
  const installedManifest = join(dshHome, 'profiles/web/node_modules/dsh-plugin-manager/package.json')
  const bundledVersion = readVersion(bundledManifest)
  if (!bundledVersion) throw new Error('bundled plugin manager manifest is unavailable')
  if (!managerNeedsInstall(bundledVersion, readVersion(installedManifest))) return false
  const cli = join(nodeModules, '@deepseek-ai/dsh/lib/bin.js')
  const archive = join(dirname(appRoot), 'plugins/dsh-plugin-manager.tgz')
  const packageBin = join(nodeModules, '.bin')
  const run = options.run ?? execFileSync
  run(process.execPath, buildManagerInstallArgs(cli, archive), {
    stdio: 'inherit',
    env: {
      ...process.env,
      DSH_HOME: dshHome,
      PATH: process.env.PATH ? `${packageBin}${delimiter}${process.env.PATH}` : packageBin,
      NODE_OPTIONS: undefined,
      NODE_PATH: undefined,
    },
  })
  return true
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  ensurePluginManager()
}
