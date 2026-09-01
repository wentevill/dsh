import { execFileSync } from 'node:child_process'
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditApp } from './audit-app.ts'

type DmgCreator = (sourceDirectory: string, outputPath: string) => void
type DmgAuditor = (imagePath: string) => void
export type DmgCommandRunner = (command: string, args: string[]) => void

function runDmgCommand(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: 'inherit' })
}

export function prepareDmgSource(
  appPath: string,
  sourceDirectory: string,
): void {
  mkdirSync(sourceDirectory)
  const stagedApp = join(sourceDirectory, basename(appPath))
  cpSync(appPath, stagedApp, { recursive: true })
  symlinkSync('/Applications', join(sourceDirectory, 'Applications'))
}

function appleScriptString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

export function buildFinderLayoutScript(mountPoint: string): string {
  return `set mountedFolder to POSIX file "${appleScriptString(mountPoint)}" as alias
tell application "Finder"
  open mountedFolder
  set mountedWindow to container window of mountedFolder
  tell mountedWindow
    set current view to icon view
    set toolbar visible to false
    set statusbar visible to false
    set bounds to {200, 200, 860, 600}
  end tell
  set theViewOptions to icon view options of mountedWindow
  tell theViewOptions
    set arrangement to not arranged
    set icon size to 128
    set text size to 14
  end tell
  set background picture of theViewOptions to file "DeepSeek Harness.app:Contents:Resources:dmg-background.png" of mountedFolder
  set position of item "DeepSeek Harness.app" of mountedFolder to {170, 190}
  set position of item "Applications" of mountedFolder to {490, 190}
  update item "Applications" of mountedFolder without registering applications
  update mountedFolder without registering applications
  close mountedWindow
  open mountedFolder
  delay 2
end tell`
}

export function createCustomizedDmg(
  sourceDirectory: string,
  outputPath: string,
  run: DmgCommandRunner = runDmgCommand,
): void {
  const temporary = mkdtempSync(join(dirname(outputPath), '.dmg-layout-'))
  const readWriteImage = join(temporary, 'writable.dmg')
  const mountPoint = join(temporary, `mount-${basename(temporary).slice(-6)}`)
  mkdirSync(mountPoint)
  let attached = false
  let failure: unknown
  try {
    try {
      run('hdiutil', [
        'create', '-volname', 'DeepSeek Harness', '-fs', 'HFS+', '-srcfolder', sourceDirectory,
        '-format', 'UDRW', '-ov', readWriteImage,
      ])
      run('hdiutil', [
        'attach', '-readwrite', '-noverify', '-noautoopen',
        '-mountpoint', mountPoint, readWriteImage,
      ])
      attached = true
      run('osascript', ['-e', buildFinderLayoutScript(mountPoint)])
      run('sync', [])
      rmSync(join(mountPoint, '.fseventsd'), { recursive: true, force: true })
    } catch (error) {
      failure = error
      throw error
    } finally {
      if (attached) {
        try {
          run('hdiutil', ['detach', mountPoint])
        } catch (error) {
          if (!failure) throw error
        }
      }
    }
    run('hdiutil', [
      'convert', readWriteImage, '-format', 'UDZO',
      '-imagekey', 'zlib-level=9', '-o', outputPath,
    ])
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

export interface MountedDmgAuditAdapters {
  flags: (path: string) => string[]
  app: (path: string) => void
}

const defaultMountedDmgAuditAdapters: MountedDmgAuditAdapters = {
  flags: path => execFileSync('stat', ['-f', '%Sf', path], { encoding: 'utf8' }).trim().split(','),
  app: auditApp,
}

export function auditMountedDmg(
  mount: string,
  adapters: MountedDmgAuditAdapters = defaultMountedDmgAuditAdapters,
): void {
  const app = join(mount, 'DeepSeek Harness.app')
  if (!lstatSync(app, { throwIfNoEntry: false })?.isDirectory()) throw new Error('DMG is missing DeepSeek Harness.app')
  const applications = join(mount, 'Applications')
  if (readlinkSync(applications) !== '/Applications') throw new Error('DMG Applications shortcut is invalid')
  if (adapters.flags(applications).includes('hidden')) throw new Error('DMG Applications shortcut must be visible')

  for (const directory of ['.background', '.fseventsd']) {
    const path = join(mount, directory)
    if (lstatSync(path, { throwIfNoEntry: false })) throw new Error(`DMG must not contain ${directory}`)
  }
  if (!lstatSync(join(app, 'Contents/Resources/dmg-background.png'), { throwIfNoEntry: false })?.isFile()) {
    throw new Error('DMG is missing background artwork')
  }
  if (!lstatSync(join(mount, '.DS_Store'), { throwIfNoEntry: false })?.isFile()) {
    throw new Error('DMG is missing Finder layout metadata')
  }
  if (!adapters.flags(join(mount, '.DS_Store')).includes('hidden')) throw new Error('DMG .DS_Store must be hidden')
  adapters.app(app)
}

export function auditDmg(imagePath: string): void {
  const mount = mkdtempSync(join(dirname(imagePath), '.dmg-audit-'))
  let attached = false
  try {
    execFileSync('hdiutil', ['verify', imagePath], { stdio: 'inherit' })
    execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, imagePath], { stdio: 'inherit' })
    attached = true
    auditMountedDmg(mount)
  } finally {
    if (attached) execFileSync('hdiutil', ['detach', mount], { stdio: 'inherit' })
    rmSync(mount, { recursive: true, force: true })
  }
}

export function packageDmg(
  appPath: string,
  outputPath: string,
  createDmg: DmgCreator = createCustomizedDmg,
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
