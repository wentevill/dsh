import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import semver from 'semver';
export const MANAGER_PACKAGE_NAME = 'dsh-plugin-manager';
function packagePath(profileDir, packageName) {
    return join(profileDir, 'node_modules', ...packageName.split('/'), 'package.json');
}
function isPackageName(value) {
    return /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/u.test(value);
}
export async function readManagedPlugins(profileDir) {
    let profile;
    try {
        profile = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return [];
        throw error;
    }
    const entries = [];
    for (const packageName of Object.keys(profile.dependencies ?? {})) {
        if (!isPackageName(packageName))
            continue;
        let installed;
        try {
            installed = JSON.parse(await readFile(packagePath(profileDir, packageName), 'utf8'));
        }
        catch {
            continue;
        }
        if (installed.name !== packageName || typeof installed.version !== 'string' || !semver.valid(installed.version))
            continue;
        if (typeof installed.dsh?.bundle?.patch !== 'string')
            continue;
        entries.push({
            packageName,
            version: installed.version,
            canUninstall: packageName !== MANAGER_PACKAGE_NAME,
        });
    }
    return entries;
}
export async function findManagedPlugin(profileDir, packageName) {
    return (await readManagedPlugins(profileDir)).find(entry => entry.packageName === packageName);
}
