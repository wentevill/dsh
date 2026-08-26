import semver from 'semver';
import { PluginManagerError } from "./errors.js";
export function classifyInstallAction(installedVersion, candidateVersion) {
    if (!semver.valid(candidateVersion)) {
        throw new PluginManagerError('PACKAGE_INVALID', 'package version is not valid semver');
    }
    if (installedVersion === undefined)
        return 'install';
    if (!semver.valid(installedVersion)) {
        throw new PluginManagerError('PACKAGE_INVALID', 'installed package version is not valid semver');
    }
    const difference = semver.compare(candidateVersion, installedVersion);
    if (difference > 0)
        return 'upgrade';
    if (difference < 0)
        return 'downgrade';
    return 'reinstall';
}
