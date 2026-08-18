import { execFileSync } from 'node:child_process'
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditApp } from './audit-app.ts'

export function prepareDmgSource(appPath: string, sourceDirectory: string): void {
  mkdirSync(sourceDirectory)
  cpSync(appPath, join(sourceDirectory, basename(appPath)), { recursive: true })
  symlinkSync('/Applications', join(sourceDirectory, 'Applications'))
}

type DmgCreator = (sourceDirectory: string, outputPath: string) => void
type DmgAuditor = (imagePath: string) => void

function createCompressedDmg(sourceDirectory: string, outputPath: string): void {
  execFileSync('hdiutil', [
    'create', '-volname', 'DeepSeek Harness', '-srcfolder', sourceDirectory,
    '-format', 'UDZO', '-ov', outputPath,
  ], { stdio: 'inherit' })
}

export function auditDmg(imagePath: string): void {
  const mount = mkdtempSync(join(dirname(imagePath), '.dmg-audit-'))
  let attached = false
  try {
    execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, imagePath], { stdio: 'inherit' })
    attached = true
    const app = join(mount, 'DeepSeek Harness.app')
    if (!lstatSync(app, { throwIfNoEntry: false })?.isDirectory()) throw new Error('DMG is missing DeepSeek Harness.app')
    if (readlinkSync(join(mount, 'Applications')) !== '/Applications') throw new Error('DMG Applications shortcut is invalid')
    auditApp(app)
  } finally {
    if (attached) execFileSync('hdiutil', ['detach', mount], { stdio: 'inherit' })
    rmSync(mount, { recursive: true, force: true })
  }
}

export function packageDmg(
  appPath: string,
  outputPath: string,
  createDmg: DmgCreator = createCompressedDmg,
  audit: DmgAuditor = auditDmg,
): void {
  mkdirSync(dirname(outputPath), { recursive: true })
  const temporary = mkdtempSync(join(dirname(outputPath), '.dmg-stage-'))
  try {
    const source = join(temporary, 'source')
    const temporaryOutput = join(temporary, 'DeepSeek Harness.dmg')
    prepareDmgSource(appPath, source)
    createDmg(source, temporaryOutput)
    const previous = join(temporary, 'previous.dmg')
    if (lstatSync(outputPath, { throwIfNoEntry: false })?.isFile()) renameSync(outputPath, previous)
    renameSync(temporaryOutput, outputPath)
    try {
      audit(outputPath)
    } catch (error) {
      rmSync(outputPath, { force: true })
      if (lstatSync(previous, { throwIfNoEntry: false })?.isFile()) renameSync(previous, outputPath)
      throw error
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const bundleRoot = resolve(desktopRoot, 'src-tauri/target/aarch64-apple-darwin/release/bundle')
  packageDmg(
    resolve(bundleRoot, 'macos/DeepSeek Harness.app'),
    resolve(bundleRoot, 'dmg/DeepSeek Harness_0.1.0_aarch64.dmg'),
  )
}
