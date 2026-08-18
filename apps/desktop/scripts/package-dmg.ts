import { execFileSync } from 'node:child_process'
import { cpSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditApp } from './audit-app.ts'

export function prepareDmgSource(appPath: string, sourceDirectory: string): void {
  mkdirSync(sourceDirectory)
  cpSync(appPath, join(sourceDirectory, basename(appPath)), { recursive: true })
  symlinkSync('/Applications', join(sourceDirectory, 'Applications'))
  const backgroundDirectory = join(sourceDirectory, '.background')
  mkdirSync(backgroundDirectory)
  cpSync(resolve(dirname(fileURLToPath(import.meta.url)), '../assets/dmg-background.png'), join(backgroundDirectory, 'background.png'))
}

type DmgCreator = (sourceDirectory: string, outputPath: string) => void
type DmgAuditor = (imagePath: string) => void
export type DmgCommandRunner = (command: string, args: string[]) => void

function runDmgCommand(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: 'inherit' })
}

function appleScriptString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

export function buildFinderLayoutScript(mountPoint: string): string {
  return `set mountedDiskName to "${appleScriptString(basename(mountPoint))}"
tell application "Finder"
  tell disk mountedDiskName
    open
    tell container window
      set current view to icon view
      set toolbar visible to false
      set statusbar visible to false
      set bounds to {200, 200, 860, 600}
    end tell
    set theViewOptions to icon view options of container window
    tell theViewOptions
      set arrangement to not arranged
      set icon size to 128
      set text size to 14
    end tell
    set background picture of theViewOptions to file ".background:background.png"
    set position of item "DeepSeek Harness.app" to {170, 190}
    set position of item "Applications" to {490, 190}
    update without registering applications
    close
    open
    delay 2
  end tell
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
