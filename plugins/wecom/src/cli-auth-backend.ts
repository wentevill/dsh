import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
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
      const request = invocation(options, ['auth', 'init', '--manual'], signal)
      const result = await options.execute({ ...request, input: `${botId}\n${secret}\n` })
      if (result.code !== 0) throw new Error(`wecom-cli manual authorization failed (${result.code})`)
    },
    deleteOwnedAuthorization: options.deleteOwned,
  }
}
