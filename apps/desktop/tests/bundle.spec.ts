import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const desktopRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('Tauri bundle layout', () => {
  it('declares an existing macOS application icon', () => {
    const configPath = join(desktopRoot, 'src-tauri/tauri.conf.json')
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as { bundle: { icon: string[] } }
    const macIcon = config.bundle.icon.find(icon => icon.endsWith('.icns'))

    expect(macIcon).toBeDefined()
    expect(existsSync(join(desktopRoot, 'src-tauri', macIcon!))).toBe(true)
  })

  it('places the runtime directly below the Tauri resource directory', () => {
    const config = JSON.parse(readFileSync(join(desktopRoot, 'src-tauri/tauri.conf.json'), 'utf8')) as {
      bundle: { resources: Record<string, string> }
    }
    expect(config.bundle.resources['resources/runtime']).toBe('runtime')
  })

  it('lets the webview receive HTML5 file drag-and-drop events', () => {
    const main = readFileSync(join(desktopRoot, 'src-tauri/src/main.rs'), 'utf8')
    expect(main).toContain('.disable_drag_drop_handler()')
  })

  it('gates release packaging on runtime and built-app audits', () => {
    const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    const build = manifest.scripts.build
    const runtimeAudit = build.indexOf('npm run audit:runtime')
    const pluginInstall = build.indexOf('npm run test:plugin-install')
    const tauriBuild = build.indexOf('@tauri-apps/cli')
    const appAudit = build.indexOf('npm run audit:app')
    const dmg = build.indexOf('package-dmg')
    expect(runtimeAudit).toBeGreaterThanOrEqual(0)
    expect(pluginInstall).toBeGreaterThan(runtimeAudit)
    expect(tauriBuild).toBeGreaterThan(pluginInstall)
    expect(appAudit).toBeGreaterThan(tauriBuild)
    expect(dmg).toBeGreaterThan(appAudit)
  })

  it('packs the release acceptance plugin through the staged private runtime', () => {
    const manifest = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
    }
    expect(manifest.scripts['test:plugin-install']).toContain('npm run pack:mail')
    expect(manifest.scripts['pack:mail']).toContain('resources/runtime/node/bin/node')
    expect(manifest.scripts['pack:mail']).toContain('scripts/pack-release.mjs')
    expect(manifest.scripts['pack:mail']).toContain('resources/runtime/app/node_modules/.bin/pnpm')
  })
})
