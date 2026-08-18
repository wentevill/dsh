import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('Tauri bundle layout', () => {
  it('places the runtime directly below the Tauri resource directory', () => {
    const config = readFileSync(join(desktopRoot, 'src-tauri/tauri.conf.json'), 'utf8')
    expect(config).toMatch(/"resources":\s*\{\s*"resources\/runtime":\s*"runtime"\s*\}/)
  })

  it('gates release packaging on runtime and built-app audits', () => {
    const manifest = readFileSync(join(desktopRoot, 'package.json'), 'utf8')
    expect(manifest).toMatch(/"build":\s*"npm run audit:runtime && .*npm run audit:app.*package-dmg/)
  })
})
