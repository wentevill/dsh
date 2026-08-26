import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PluginCli, type CommandRunner } from '../src/cli.ts'
import { readManagedPlugins } from '../src/profile.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function profile(): Promise<{ root: string; profileDir: string }> {
  const root = await mkdtemp(join(tmpdir(), 'plugin-manager-profile-'))
  roots.push(root)
  const profileDir = join(root, 'profiles/web')
  await mkdir(join(profileDir, 'node_modules/dsh-mail'), { recursive: true })
  await mkdir(join(profileDir, 'node_modules/plain-library'), { recursive: true })
  await mkdir(join(profileDir, 'node_modules/dsh-plugin-manager'), { recursive: true })
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({
    dependencies: {
      'dsh-mail': '1.2.3',
      'plain-library': '4.0.0',
      'dsh-plugin-manager': '0.1.0',
    },
  }))
  await writeFile(join(profileDir, 'node_modules/dsh-mail/package.json'), JSON.stringify({
    name: 'dsh-mail', version: '1.2.3', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  await writeFile(join(profileDir, 'node_modules/plain-library/package.json'), JSON.stringify({
    name: 'plain-library', version: '4.0.0',
  }))
  await writeFile(join(profileDir, 'node_modules/dsh-plugin-manager/package.json'), JSON.stringify({
    name: 'dsh-plugin-manager', version: '0.1.0', dsh: { bundle: { patch: './cordis.patch.yml' } },
  }))
  return { root, profileDir }
}

describe('readManagedPlugins', () => {
  it('lists dependency-backed bundles with actual versions and protects the manager', async () => {
    const { profileDir } = await profile()
    await expect(readManagedPlugins(profileDir)).resolves.toEqual([
      { packageName: 'dsh-mail', version: '1.2.3', canUninstall: true },
      { packageName: 'dsh-plugin-manager', version: '0.1.0', canUninstall: false },
    ])
  })
})

describe('PluginCli', () => {
  it('invokes install and uninstall with fixed web-profile arguments', async () => {
    const calls: Array<{ command: string; args: readonly string[]; environment: NodeJS.ProcessEnv }> = []
    const runner: CommandRunner = async (command, args, options) => {
      calls.push({ command, args, environment: options.env })
      return { code: 0, stderr: '' }
    }
    const cli = new PluginCli({
      node: '/private/runtime/node',
      dsh: '/private/runtime/dsh.js',
      packageBin: '/private/runtime/.bin',
      dshHome: '/private/profile',
    }, runner)

    await cli.install('/private/upload/plugin.tgz')
    await cli.uninstall('dsh-mail')

    expect(calls.map(call => call.command)).toEqual(['/private/runtime/node', '/private/runtime/node'])
    expect(calls.map(call => call.args)).toEqual([
      ['/private/runtime/dsh.js', 'plugin', '--profile', 'web', 'add', '--ignore-scripts', '/private/upload/plugin.tgz'],
      ['/private/runtime/dsh.js', 'plugin', '--profile', 'web', 'remove', 'dsh-mail'],
    ])
    expect(calls[0]!.environment.DSH_HOME).toBe('/private/profile')
    expect(calls[0]!.environment.PATH?.split(':')[0]).toBe('/private/runtime/.bin')
    expect(calls[0]!.environment.NODE_OPTIONS).toBeUndefined()
  })

  it('maps nonzero process exits to operation-specific safe errors', async () => {
    const runner: CommandRunner = async () => ({ code: 1, stderr: '/secret/profile failed badly' })
    const cli = new PluginCli({
      node: '/private/runtime/node', dsh: '/private/runtime/dsh.js',
      packageBin: '/private/runtime/.bin', dshHome: '/private/profile',
    }, runner)
    await expect(cli.install('/private/upload/plugin.tgz')).rejects.toMatchObject({ code: 'INSTALL_FAILED' })
    await expect(cli.uninstall('dsh-mail')).rejects.toMatchObject({ code: 'UNINSTALL_FAILED' })
  })
})
