import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { buildHermeticEnvironment } from './release-env.mjs'

const script = fileURLToPath(import.meta.url)

function argument(name) {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

if (resolve(process.argv[1] ?? '') === script) {
  const cli = argument('--cli')
  const archive = argument('--archive')
  const profile = argument('--profile')
  const dshHome = argument('--dsh-home')
  const packageBin = argument('--package-bin')
  if ([cli, archive, profile, dshHome, packageBin].some(value => value === undefined || value === '')) {
    throw new Error('mail install: --cli, --archive, --profile, --dsh-home, and --package-bin are required')
  }
  const temporary = mkdtempSync(`${tmpdir()}/dsh-mail-install-`)
  try {
    const env = buildHermeticEnvironment({
      root: temporary,
      dshHome,
      nodeBin: dirname(process.execPath),
      packageBin,
      offline: true,
    })
    const result = spawnSync(process.execPath, [cli, 'plugin', '--profile', profile, 'add', archive], { env, stdio: 'inherit' })
    if (result.error !== undefined) throw result.error
    if (result.status !== 0) process.exitCode = result.status ?? 1
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
