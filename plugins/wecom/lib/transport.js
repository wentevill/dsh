import { spawn } from 'node:child_process';
/** Create the production executor used for shell-free CLI child processes. */
export function createNodeProcessExecutor() {
    return invocation => new Promise((resolve, reject) => {
        const child = spawn(invocation.executable, invocation.args, {
            cwd: invocation.cwd,
            env: { PATH: process.env.PATH ?? '', ...invocation.env },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false,
        });
        let stdout = '';
        let stderr = '';
        let bytes = 0;
        let settled = false;
        const finish = (error, result) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            invocation.signal?.removeEventListener('abort', abort);
            if (error !== undefined)
                reject(error);
            else
                resolve(result);
        };
        const append = (target, chunk) => {
            bytes += chunk.byteLength;
            if (bytes > invocation.maxOutputBytes) {
                child.kill('SIGKILL');
                finish(new Error(`wecom-cli output exceeded ${invocation.maxOutputBytes} bytes`));
                return;
            }
            if (target === 'stdout')
                stdout += chunk.toString('utf8');
            else
                stderr += chunk.toString('utf8');
        };
        const abort = () => {
            child.kill('SIGTERM');
            finish(new Error('wecom-cli invocation aborted'));
        };
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
            finish(new Error(`wecom-cli timed out after ${invocation.timeoutMs}ms`));
        }, invocation.timeoutMs);
        child.stdout.on('data', (chunk) => { append('stdout', chunk); });
        child.stderr.on('data', (chunk) => { append('stderr', chunk); });
        child.once('error', error => { finish(error); });
        child.once('close', code => {
            finish(undefined, { code: code ?? 1, stdout, stderr });
        });
        if (invocation.signal?.aborted === true)
            abort();
        else
            invocation.signal?.addEventListener('abort', abort, { once: true });
    });
}
/** Structured failure projected from a non-zero wecom-cli exit. */
export class WeComCliError extends Error {
    exitCode;
    code;
    name = 'WeComCliError';
    constructor(message, exitCode, code) {
        super(message);
        this.exitCode = exitCode;
        this.code = code;
    }
}
function parseJsonOutput(stdout) {
    const document = stdout.trim();
    if (document === '')
        throw new WeComCliError('wecom-cli returned invalid JSON output', 0);
    try {
        return JSON.parse(document);
    }
    catch {
        // Paginated commands may emit one complete JSON value per line.
    }
    try {
        const lines = document.split(/\r?\n/u).filter(line => line.trim() !== '');
        const pages = lines.map(line => JSON.parse(line));
        return pages.length === 1 ? pages[0] : pages;
    }
    catch {
        throw new WeComCliError('wecom-cli returned invalid JSON output', 0);
    }
}
function structuredFailure(stdout, exitCode) {
    try {
        const parsed = JSON.parse(stdout);
        const message = typeof parsed.error?.message === 'string' ? parsed.error.message : `wecom-cli exited with code ${exitCode}`;
        const code = typeof parsed.error?.code === 'number' ? parsed.error.code : undefined;
        return new WeComCliError(message, exitCode, code);
    }
    catch {
        return new WeComCliError(`wecom-cli exited with code ${exitCode}`, exitCode);
    }
}
/** Build a runner bound to one DSH profile and one packaged CLI executable. */
export function createWeComProcessRunner(options) {
    return {
        async run(request) {
            const args = [...request.path];
            if (request.body !== undefined)
                args.push('--json', JSON.stringify(request.body));
            const result = await options.execute({
                executable: options.executable,
                args,
                cwd: options.tempDir,
                env: {
                    WECOM_CLI_CONFIG_DIR: options.configDir,
                    WECOM_CLI_TMP_DIR: options.tempDir,
                },
                maxOutputBytes: options.maxOutputBytes ?? 1_048_576,
                timeoutMs: request.timeoutMs ?? options.timeoutMs ?? 30_000,
                signal: request.signal,
            });
            if (result.code !== 0)
                throw structuredFailure(result.stdout, result.code);
            return { value: parseJsonOutput(result.stdout), stderr: result.stderr };
        },
    };
}
