import { execFileSync } from 'node:child_process'
import { lstatSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditRuntime } from './audit-runtime.ts'

export interface AppAuditAdapters {
  architectures(binary: string): string[]
  runtime(root: string): void
  signature(app: string): void
}

const defaultAdapters: AppAuditAdapters = {
  architectures: binary => execFileSync('lipo', ['-archs', binary], { encoding: 'utf8' }).trim().split(/\s+/),
  runtime: auditRuntime,
  signature: app => execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' }),
}

export type AppSignRunner = (command: string, args: string[]) => void

export function signApp(
  appPath: string,
  run: AppSignRunner = (command, args) => execFileSync(command, args, { stdio: 'inherit' }),
): void {
  run('codesign', ['--force', '--deep', '--sign', '-', appPath])
}

export function auditApp(appPath: string, adapters: AppAuditAdapters = defaultAdapters): void {
  if (!appPath.endsWith('.app') || !lstatSync(appPath, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Missing macOS application bundle: ${appPath}`)
  }
  const executableDirectory = join(appPath, 'Contents/MacOS')
  const executable = readdirSync(executableDirectory).find(name => lstatSync(join(executableDirectory, name)).isFile())
  if (!executable) throw new Error(`Missing application executable in: ${executableDirectory}`)
  const binary = join(executableDirectory, executable)
  if (!lstatSync(binary, { throwIfNoEntry: false })?.isFile()) throw new Error(`Missing application executable: ${binary}`)
  const architectures = adapters.architectures(binary)
  if (architectures.length !== 1 || architectures[0] !== 'arm64') {
    throw new Error(`Application executable must be arm64-only, got: ${architectures.join(' ')}`)
  }
  adapters.runtime(join(appPath, 'Contents/Resources/runtime'))
  adapters.signature(appPath)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sign = process.argv[2] === '--sign'
  const appPath = process.argv[sign ? 3 : 2]
  if (!appPath) throw new Error('usage: audit-app.ts [--sign] <path-to-app>')
  if (sign) signApp(resolve(appPath))
  auditApp(resolve(appPath))
}
