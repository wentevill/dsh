import { stat } from 'node:fs/promises';
import { join, normalize, sep } from 'node:path';
import { PluginManagerError } from "./errors.js";
async function requireFile(path) {
    try {
        if (!(await stat(path)).isFile())
            throw new Error('not a file');
    }
    catch (error) {
        throw new PluginManagerError('RUNTIME_UNAVAILABLE', 'Desktop private runtime is unavailable', { cause: error });
    }
}
export async function resolvePrivateRuntime(facts) {
    if (!facts.argv1 || !facts.dshHome) {
        throw new PluginManagerError('RUNTIME_UNAVAILABLE', 'Desktop private runtime is unavailable');
    }
    const marker = `${sep}node_modules${sep}@deepseek-ai${sep}dsh${sep}lib${sep}bin.js`;
    const dsh = normalize(facts.argv1);
    if (!dsh.endsWith(marker)) {
        throw new PluginManagerError('RUNTIME_UNAVAILABLE', 'Desktop private runtime is unavailable');
    }
    const nodeModules = dsh.slice(0, -marker.length) + `${sep}node_modules`;
    const packageBin = join(nodeModules, '.bin');
    await Promise.all([
        requireFile(facts.execPath),
        requireFile(dsh),
        requireFile(join(packageBin, process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')),
    ]);
    return { node: facts.execPath, dsh, packageBin, dshHome: facts.dshHome };
}
