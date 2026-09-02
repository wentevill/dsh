import { delimiter } from 'node:path';
import { spawn } from 'node:child_process';
import { PluginManagerError } from "./errors.js";
const MAX_DIAGNOSTIC_BYTES = 64 * 1024;
export const runCommand = async (command, args, options) => new Promise((resolve, reject) => {
    const child = spawn(command, args, {
        env: options.env,
        signal: options.signal,
        stdio: ['ignore', 'ignore', 'pipe'],
    });
    const chunks = [];
    let bytes = 0;
    child.stderr.on('data', (chunk) => {
        if (bytes >= MAX_DIAGNOSTIC_BYTES)
            return;
        const remaining = MAX_DIAGNOSTIC_BYTES - bytes;
        const bounded = chunk.subarray(0, remaining);
        chunks.push(bounded);
        bytes += bounded.length;
    });
    child.once('error', reject);
    child.once('close', code => resolve({ code: code ?? 1, stderr: Buffer.concat(chunks).toString('utf8') }));
});
export class PluginCli {
    paths;
    runner;
    constructor(paths, runner = runCommand) {
        this.paths = paths;
        this.runner = runner;
    }
    install(archivePath, signal) {
        return this.execute('INSTALL_FAILED', [
            this.paths.dsh, 'plugin', '--profile', 'web', 'add', '--ignore-scripts', archivePath,
        ], signal);
    }
    uninstall(packageName, signal) {
        return this.execute('UNINSTALL_FAILED', [
            this.paths.dsh, 'plugin', '--profile', 'web', 'remove', packageName,
        ], signal);
    }
    async execute(code, args, signal) {
        const env = { ...process.env };
        delete env.NODE_OPTIONS;
        delete env.NODE_PATH;
        env.DSH_HOME = this.paths.dshHome;
        env.PATH = env.PATH
            ? `${this.paths.packageBin}${delimiter}${env.PATH}`
            : this.paths.packageBin;
        let result;
        try {
            result = await this.runner(this.paths.node, args, { env, signal });
        }
        catch (error) {
            throw new PluginManagerError(code, 'plugin operation could not start', { cause: error });
        }
        if (result.code !== 0) {
            const detail = result.stderr.trim();
            throw new PluginManagerError(code, detail ? `plugin operation failed: ${detail}` : 'plugin operation failed');
        }
    }
}
