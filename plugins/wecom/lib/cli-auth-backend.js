import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { platform } from 'node:os';
function invocation(options, args, signal) {
    return {
        executable: options.executable,
        args,
        cwd: options.tempDir,
        env: {
            WECOM_CLI_CONFIG_DIR: options.configDir,
            WECOM_CLI_TMP_DIR: options.tempDir,
        },
        maxOutputBytes: 1_048_576,
        timeoutMs: 300_000,
        signal,
    };
}
/** Bind the fixed auth commands and QR file to one profile-owned CLI directory. */
export function createCliAuthBackend(options) {
    return {
        async status() {
            const result = await options.execute(invocation(options, ['auth', 'show', '--status']));
            if (result.code !== 0)
                throw new Error(`wecom-cli auth status failed (${result.code})`);
            return { authorized: result.stdout.trim() === 'authorized' };
        },
        async connect({ signal, onQr }) {
            const filename = `qr-${randomUUID()}.png`;
            const path = join(options.tempDir, filename);
            await rm(path, { force: true });
            const waiter = new AbortController();
            const waitSignal = AbortSignal.any([signal, waiter.signal]);
            const pending = options.execute(invocation(options, [
                'auth', 'init', '--noninteractive', '--no-browser', '--output-qrcode', filename,
            ], signal));
            try {
                const first = await Promise.race([
                    options.readQr(path, waitSignal).then(qr => ({ kind: 'qr', qr })),
                    pending.then(result => ({ kind: 'exit', result })),
                ]);
                if (first.kind === 'exit')
                    throw new Error(`wecom-cli authorization exited before producing a QR (${first.result.code})`);
                onQr(`data:image/png;base64,${Buffer.from(first.qr).toString('base64')}`);
                const result = await pending;
                if (result.code !== 0)
                    throw new Error(`wecom-cli authorization failed (${result.code})`);
            }
            finally {
                waiter.abort();
                await rm(path, { force: true });
            }
        },
        async provision(botId, secret, signal) {
            await provisionManual(options, botId, secret, signal);
        },
        deleteOwnedAuthorization: options.deleteOwned,
    };
}
function provisionManual(options, botId, secret, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error('wecom-cli manual authorization aborted'));
            return;
        }
        const spawn = options.ptySpawn ?? spawnScriptPty;
        let pty;
        try {
            pty = spawn(options.executable, ['auth', 'init', '--manual'], {
                name: 'xterm-color', cols: 80, rows: 24, cwd: options.tempDir,
                env: {
                    ...definedEnvironment(),
                    PATH: process.env.PATH ?? '',
                    TERM: 'xterm-color',
                    WECOM_CLI_CONFIG_DIR: options.configDir,
                    WECOM_CLI_TMP_DIR: options.tempDir,
                },
            });
        }
        catch {
            reject(new Error('wecom-cli manual authorization failed to start'));
            return;
        }
        let settled = false;
        let phase = 'bot';
        let output = '';
        let terminalError;
        let timer;
        let data = { dispose() { } };
        let exit = { dispose() { } };
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            if (timer)
                clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            data.dispose();
            exit.dispose();
            if (error)
                reject(error);
            else
                resolve();
        };
        data = pty.onData(chunk => {
            if (settled || phase === 'exit')
                return;
            output = (output + chunk.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '')).slice(-4096);
            if (phase === 'bot' && /Bot ID/i.test(output)) {
                phase = 'secret';
                output = '';
                pty.write(`${botId}\r`);
            }
            else if (phase === 'secret' && /Secret/i.test(output)) {
                phase = 'exit';
                output = '';
                pty.write(`${secret}\r`);
            }
        });
        exit = pty.onExit(event => {
            finish(terminalError ?? (event.exitCode === 0 && phase === 'exit'
                ? undefined
                : new Error(`wecom-cli manual authorization failed (${event.exitCode})`)));
        });
        const abort = () => {
            terminalError = new Error('wecom-cli manual authorization aborted');
            pty.kill();
        };
        timer = setTimeout(() => {
            terminalError = new Error('wecom-cli manual authorization timed out');
            pty.kill();
        }, 30_000);
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted)
            abort();
    });
}
function spawnScriptPty(executable, args, options) {
    if (args.join('\0') !== ['auth', 'init', '--manual'].join('\0')) {
        throw new Error('unsupported PTY command');
    }
    const os = platform();
    if (os !== 'darwin' && os !== 'linux') {
        throw new Error('secure wecom-cli manual authorization requires a Unix PTY');
    }
    const launcher = os === 'darwin' ? '/usr/bin/expect' : '/usr/bin/script';
    const launcherArgs = os === 'darwin'
        ? ['-c', [
                'log_user 1',
                'spawn $env(WECOM_CLI_EXECUTABLE) auth init --manual',
                'interact',
                'catch wait result',
                'exit [lindex $result 3]',
            ].join('\n')]
        : ['-q', '-c', `${shellQuote(executable)} auth init --manual`, '/dev/null'];
    const child = spawn(launcher, launcherArgs, {
        cwd: options.cwd,
        env: { ...options.env, WECOM_CLI_EXECUTABLE: executable },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
    });
    const dataListeners = new Set();
    const exitListeners = new Set();
    let exited;
    let killTimer;
    const publishData = (chunk) => {
        const value = chunk.toString('utf8');
        for (const listener of dataListeners)
            listener(value);
    };
    child.stdout.on('data', publishData);
    child.stderr.on('data', publishData);
    child.once('error', () => publishExit(1));
    child.once('close', code => publishExit(code ?? 1));
    function publishExit(exitCode) {
        if (exited)
            return;
        if (killTimer)
            clearTimeout(killTimer);
        exited = { exitCode };
        for (const listener of exitListeners)
            listener(exited);
        exitListeners.clear();
        dataListeners.clear();
    }
    return {
        onData(listener) { dataListeners.add(listener); return { dispose: () => dataListeners.delete(listener) }; },
        onExit(listener) {
            if (exited)
                queueMicrotask(() => listener(exited));
            else
                exitListeners.add(listener);
            return { dispose: () => exitListeners.delete(listener) };
        },
        write(data) { child.stdin.write(data); },
        kill() {
            if (exited || child.pid === undefined)
                return;
            child.kill('SIGTERM');
            killTimer = setTimeout(() => {
                if (exited || child.pid === undefined)
                    return;
                child.kill('SIGKILL');
            }, 1000);
        },
    };
}
function shellQuote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}
function definedEnvironment() {
    return Object.fromEntries(Object.entries(process.env).filter((entry) => entry[1] !== undefined));
}
