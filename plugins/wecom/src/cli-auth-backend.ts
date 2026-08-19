import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import type { AuthBackend, AuthStatus } from './auth.ts'
import type { ProcessExecutor, ProcessInvocation } from './transport.ts'

export interface AuthPty {
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number }) => void): { dispose(): void }
  write(data: string): void
  kill(): void
}

export type AuthPtySpawn = (
  executable: string,
  args: string[],
  options: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> },
) => AuthPty

interface CliAuthBackendOptions {
  readonly executable: string
  readonly configDir: string
  readonly tempDir: string
  readonly execute: ProcessExecutor
  readonly readQr: (path: string, signal: AbortSignal) => Promise<Uint8Array>
  readonly deleteOwned: () => Promise<void>
  readonly ptySpawn?: AuthPtySpawn
}

export interface CliAuthBackend extends AuthBackend {
  provision(botId: string, secret: string, signal?: AbortSignal): Promise<void>
}

function invocation(options: CliAuthBackendOptions, args: readonly string[], signal?: AbortSignal): ProcessInvocation {
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
  }
}

/** Bind the fixed auth commands and QR file to one profile-owned CLI directory. */
export function createCliAuthBackend(options: CliAuthBackendOptions): CliAuthBackend {
  return {
    async status(): Promise<AuthStatus> {
      const result = await options.execute(invocation(options, ['auth', 'show', '--status']))
      if (result.code !== 0) throw new Error(`wecom-cli auth status failed (${result.code})`)
      return { authorized: result.stdout.trim() === 'authorized' }
    },
    async connect({ signal, onQr }): Promise<void> {
      const filename = `qr-${randomUUID()}.png`
      const path = join(options.tempDir, filename)
      await rm(path, { force: true })
      const waiter = new AbortController()
      const waitSignal = AbortSignal.any([signal, waiter.signal])
      const pending = options.execute(invocation(options, [
        'auth', 'init', '--noninteractive', '--no-browser', '--output-qrcode', filename,
      ], signal))
      try {
        const first = await Promise.race([
          options.readQr(path, waitSignal).then(qr => ({ kind: 'qr' as const, qr })),
          pending.then(result => ({ kind: 'exit' as const, result })),
        ])
        if (first.kind === 'exit') throw new Error(`wecom-cli authorization exited before producing a QR (${first.result.code})`)
        onQr(`data:image/png;base64,${Buffer.from(first.qr).toString('base64')}`)
        const result = await pending
        if (result.code !== 0) throw new Error(`wecom-cli authorization failed (${result.code})`)
      } finally {
        waiter.abort()
        await rm(path, { force: true })
      }
    },
    async provision(botId: string, secret: string, signal?: AbortSignal): Promise<void> {
      await provisionManual(options, botId, secret, signal)
    },
    deleteOwnedAuthorization: options.deleteOwned,
  }
}

function provisionManual(
  options: CliAuthBackendOptions,
  botId: string,
  secret: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('wecom-cli manual authorization aborted')); return }
    const spawn = options.ptySpawn ?? spawnScriptPty
    let pty: AuthPty
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
      })
    } catch {
      reject(new Error('wecom-cli manual authorization failed to start'))
      return
    }
    let settled = false
    let phase: 'bot' | 'secret' | 'exit' = 'bot'
    let output = ''
    let terminalError: Error | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    let data: { dispose(): void } = { dispose() {} }
    let exit: { dispose(): void } = { dispose() {} }
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      data.dispose()
      exit.dispose()
      if (error) reject(error)
      else resolve()
    }
    data = pty.onData(chunk => {
      if (settled || phase === 'exit') return
      output = (output + chunk.replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, '')).slice(-4096)
      if (phase === 'bot' && /Bot ID/i.test(output)) {
        phase = 'secret'
        output = ''
        pty.write(`${botId}\r`)
      } else if (phase === 'secret' && /Secret/i.test(output)) {
        phase = 'exit'
        output = ''
        pty.write(`${secret}\r`)
      }
    })
    exit = pty.onExit(event => {
      finish(terminalError ?? (event.exitCode === 0 && phase === 'exit'
        ? undefined
        : new Error(`wecom-cli manual authorization failed (${event.exitCode})`)))
    })
    const abort = () => {
      terminalError = new Error('wecom-cli manual authorization aborted')
      pty.kill()
    }
    timer = setTimeout(() => {
      terminalError = new Error('wecom-cli manual authorization timed out')
      pty.kill()
    }, 30_000)
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) abort()
  })
}

function spawnScriptPty(
  executable: string,
  args: string[],
  options: { name: string; cols: number; rows: number; cwd: string; env: Record<string, string> },
): AuthPty {
  if (args.join('\0') !== ['auth', 'init', '--manual'].join('\0')) {
    throw new Error('unsupported PTY command')
  }
  const os = platform()
  if (os !== 'darwin' && os !== 'linux') {
    throw new Error('secure wecom-cli manual authorization requires a Unix PTY')
  }
  const launcher = os === 'darwin' ? '/usr/bin/expect' : '/usr/bin/script'
  const launcherArgs = os === 'darwin'
    ? ['-c', [
        'log_user 1',
        'spawn $env(WECOM_CLI_EXECUTABLE) auth init --manual',
        'interact',
        'catch wait result',
        'exit [lindex $result 3]',
      ].join('\n')]
    : ['-q', '-c', `${shellQuote(executable)} auth init --manual`, '/dev/null']
  const child = spawn(launcher, launcherArgs, {
    cwd: options.cwd,
    env: { ...options.env, WECOM_CLI_EXECUTABLE: executable },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
  })
  const dataListeners = new Set<(data: string) => void>()
  const exitListeners = new Set<(event: { exitCode: number }) => void>()
  let exited: { exitCode: number } | undefined
  let killTimer: ReturnType<typeof setTimeout> | undefined
  const publishData = (chunk: Buffer) => {
    const value = chunk.toString('utf8')
    for (const listener of dataListeners) listener(value)
  }
  child.stdout.on('data', publishData)
  child.stderr.on('data', publishData)
  child.once('error', () => publishExit(1))
  child.once('close', code => publishExit(code ?? 1))
  function publishExit(exitCode: number) {
    if (exited) return
    if (killTimer) clearTimeout(killTimer)
    exited = { exitCode }
    for (const listener of exitListeners) listener(exited)
    exitListeners.clear()
    dataListeners.clear()
  }
  return {
    onData(listener) { dataListeners.add(listener); return { dispose: () => dataListeners.delete(listener) } },
    onExit(listener) {
      if (exited) queueMicrotask(() => listener(exited!))
      else exitListeners.add(listener)
      return { dispose: () => exitListeners.delete(listener) }
    },
    write(data) { child.stdin.write(data) },
    kill() {
      if (exited || child.pid === undefined) return
      child.kill('SIGTERM')
      killTimer = setTimeout(() => {
        if (exited || child.pid === undefined) return
        child.kill('SIGKILL')
      }, 1000)
    },
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function definedEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}
