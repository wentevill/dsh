import { describe, expect, it } from 'vitest'
import { buildManagerInstallArgs, managerNeedsInstall } from './ensure-plugin-manager.mjs'

describe('plugin manager bootstrap', () => {
  it('installs only when the profile manager version differs from the bundled version', () => {
    expect(managerNeedsInstall('0.1.0', undefined)).toBe(true)
    expect(managerNeedsInstall('0.1.0', '0.0.9')).toBe(true)
    expect(managerNeedsInstall('0.1.0', '0.2.0')).toBe(true)
    expect(managerNeedsInstall('0.1.0', '0.1.0')).toBe(false)
  })

  it('uses the fixed web profile and disables lifecycle scripts', () => {
    expect(buildManagerInstallArgs('/runtime/dsh.js', '/runtime/plugins/manager.tgz')).toEqual([
      '/runtime/dsh.js', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', '/runtime/plugins/manager.tgz',
    ])
  })
})
