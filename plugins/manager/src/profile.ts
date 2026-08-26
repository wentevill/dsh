import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import semver from 'semver'

export const MANAGER_PACKAGE_NAME = 'dsh-plugin-manager'

export interface ManagedPluginEntry {
  readonly packageName: string
  readonly version: string
  readonly canUninstall: boolean
}

interface ProfileManifest {
  dependencies?: Record<string, string>
}

interface InstalledManifest {
  name?: unknown
  version?: unknown
  dsh?: { bundle?: { patch?: unknown } }
}

function packagePath(profileDir: string, packageName: string): string {
  return join(profileDir, 'node_modules', ...packageName.split('/'), 'package.json')
}

function isPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u.test(value)
}

export async function readManagedPlugins(profileDir: string): Promise<ManagedPluginEntry[]> {
  let profile: ProfileManifest
  try {
    profile = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8')) as ProfileManifest
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const entries: ManagedPluginEntry[] = []
  for (const packageName of Object.keys(profile.dependencies ?? {})) {
    if (!isPackageName(packageName)) continue
    let installed: InstalledManifest
    try {
      installed = JSON.parse(await readFile(packagePath(profileDir, packageName), 'utf8')) as InstalledManifest
    } catch {
      continue
    }
    if (installed.name !== packageName || typeof installed.version !== 'string' || !semver.valid(installed.version)) continue
    if (typeof installed.dsh?.bundle?.patch !== 'string') continue
    entries.push({
      packageName,
      version: installed.version,
      canUninstall: packageName !== MANAGER_PACKAGE_NAME,
    })
  }
  return entries
}

export async function findManagedPlugin(
  profileDir: string,
  packageName: string,
): Promise<ManagedPluginEntry | undefined> {
  return (await readManagedPlugins(profileDir)).find(entry => entry.packageName === packageName)
}
