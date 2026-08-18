import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export function prepareDmgSource(appPath: string, sourceDirectory: string): void {
  mkdirSync(sourceDirectory)
  cpSync(appPath, join(sourceDirectory, basename(appPath)), { recursive: true })
  symlinkSync('/Applications', join(sourceDirectory, 'Applications'))
}

type DmgCreator = (sourceDirectory: string, outputPath: string) => void

function createCompressedDmg(sourceDirectory: string, outputPath: string): void {
  execFileSync('hdiutil', [
    'create', '-volname', 'DeepSeek Harness', '-srcfolder', sourceDirectory,
    '-format', 'UDZO', '-ov', outputPath,
  ], { stdio: 'inherit' })
}

export function packageDmg(appPath: string, outputPath: string, createDmg: DmgCreator = createCompressedDmg): void {
  mkdirSync(dirname(outputPath), { recursive: true })
  const temporary = mkdtempSync(join(dirname(outputPath), '.dmg-stage-'))
  try {
    const source = join(temporary, 'source')
    const temporaryOutput = join(temporary, 'DeepSeek Harness.dmg')
    prepareDmgSource(appPath, source)
    createDmg(source, temporaryOutput)
    renameSync(temporaryOutput, outputPath)
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
