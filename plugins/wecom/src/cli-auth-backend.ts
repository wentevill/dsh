import { join } from 'node:path'
import type { AuthBackend, AuthStatus } from './auth.ts'
import type { ProcessExecutor, ProcessInvocation } from './transport.ts'

interface CliAuthBackendOptions {
  readonly executable: string
  readonly configDir: string
  readonly tempDir: string
  readonly execute: ProcessExecutor
  readonly readQr: (path: string, signal: AbortSignal) => Promise<Uint8Array>
  readonly deleteOwned: () => Promise<void>
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
export function createCliAuthBackend(options: CliAuthBackendOptions): AuthBackend {
  return {
    async status(): Promise<AuthStatus> {
      const result = await options.execute(invocation(options, ['auth', 'show', '--status']))
      if (result.code !== 0) throw new Error(`wecom-cli auth status failed (${result.code})`)
      return { authorized: result.stdout.trim() === 'authorized' }
    },
    async connect({ signal, onQr }): Promise<void> {
      const pending = options.execute(invocation(options, [
        'auth', 'init', '--noninteractive', '--no-browser', '--output-qrcode', 'qr.png',
      ], signal))
      const qr = await options.readQr(join(options.tempDir, 'qr.png'), signal)
      onQr(`data:image/png;base64,${Buffer.from(qr).toString('base64')}`)
      const result = await pending
      if (result.code !== 0) throw new Error(`wecom-cli authorization failed (${result.code})`)
    },
    deleteOwnedAuthorization: options.deleteOwned,
  }
}
