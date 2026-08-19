import { spawn } from 'node:child_process'

/** JSON values accepted and returned by the WeCom discovery protocol. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue }

/** One bounded, shell-free process invocation. */
export interface ProcessInvocation {
  readonly executable: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly maxOutputBytes: number
  readonly timeoutMs: number
  readonly signal: AbortSignal | undefined
}

/** Result captured by the process executor. */
export interface ProcessResult {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

/** Injectable process seam used by the production subprocess adapter and tests. */
export type ProcessExecutor = (invocation: ProcessInvocation) => Promise<ProcessResult>

/** Create the production executor used for shell-free CLI child processes. */
export function createNodeProcessExecutor(): ProcessExecutor {
  return invocation => new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.args, {
      cwd: invocation.cwd,
      env: { PATH: process.env.PATH ?? '', ...invocation.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    let bytes = 0
    let settled = false

    const finish = (error?: Error, result?: ProcessResult): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      invocation.signal?.removeEventListener('abort', abort)
      if (error !== undefined) reject(error)
      else resolve(result as ProcessResult)
    }
    const append = (target: 'stdout' | 'stderr', chunk: Buffer): void => {
      bytes += chunk.byteLength
      if (bytes > invocation.maxOutputBytes) {
        child.kill('SIGKILL')
        finish(new Error(`wecom-cli output exceeded ${invocation.maxOutputBytes} bytes`))
        return
      }
      if (target === 'stdout') stdout += chunk.toString('utf8')
      else stderr += chunk.toString('utf8')
    }
    const abort = (): void => {
      child.kill('SIGTERM')
      finish(new Error('wecom-cli invocation aborted'))
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(new Error(`wecom-cli timed out after ${invocation.timeoutMs}ms`))
    }, invocation.timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => { append('stdout', chunk) })
    child.stderr.on('data', (chunk: Buffer) => { append('stderr', chunk) })
    child.once('error', error => { finish(error) })
    child.once('close', code => {
      finish(undefined, { code: code ?? 1, stdout, stderr })
    })
    if (invocation.signal?.aborted === true) abort()
    else invocation.signal?.addEventListener('abort', abort, { once: true })
  })
}

/** One remote CLI operation. */
export interface WeComRunRequest {
  readonly path: readonly string[]
  readonly body?: JsonValue
  readonly signal?: AbortSignal
  readonly timeoutMs?: number
}

/** Canonical value plus bounded non-model diagnostic text. */
export interface WeComRunResult {
  readonly value: JsonValue
  readonly stderr: string
}

/** Structured failure projected from a non-zero wecom-cli exit. */
export class WeComCliError extends Error {
  readonly name = 'WeComCliError'

  constructor(
    message: string,
    readonly exitCode: number,
    readonly code?: number,
  ) {
    super(message)
  }
}

interface RunnerOptions {
  readonly executable: string
  readonly configDir: string
  readonly tempDir: string
  readonly execute: ProcessExecutor
  readonly maxOutputBytes?: number
  readonly timeoutMs?: number
}

function parseJsonOutput(stdout: string): JsonValue {
  const document = stdout.trim()
  if (document === '') throw new WeComCliError('wecom-cli returned invalid JSON output', 0)
  try {
    return JSON.parse(document) as JsonValue
  } catch {
    // Paginated commands may emit one complete JSON value per line.
  }
  try {
    const lines = document.split(/\r?\n/u).filter(line => line.trim() !== '')
    const pages = lines.map(line => JSON.parse(line) as JsonValue)
    return pages.length === 1 ? pages[0] as JsonValue : pages
  } catch {
    throw new WeComCliError('wecom-cli returned invalid JSON output', 0)
  }
}

function structuredFailure(stdout: string, exitCode: number): WeComCliError {
  try {
    const parsed = JSON.parse(stdout) as {
      errcode?: unknown
      errmsg?: unknown
      help_message?: unknown
      error?: { code?: unknown; message?: unknown }
    }
    const topLevelMessage = typeof parsed.help_message === 'string'
      ? parsed.help_message
      : typeof parsed.errmsg === 'string' ? parsed.errmsg : undefined
    const message = topLevelMessage
      ?? (typeof parsed.error?.message === 'string' ? parsed.error.message : `wecom-cli exited with code ${exitCode}`)
    const code = typeof parsed.errcode === 'number'
      ? parsed.errcode
      : typeof parsed.error?.code === 'number' ? parsed.error.code : undefined
    return new WeComCliError(message, exitCode, code)
  } catch {
    return new WeComCliError(`wecom-cli exited with code ${exitCode}`, exitCode)
  }
}

/** Build a runner bound to one DSH profile and one packaged CLI executable. */
export function createWeComProcessRunner(options: RunnerOptions): {
  run(request: WeComRunRequest): Promise<WeComRunResult>
} {
  return {
    async run(request): Promise<WeComRunResult> {
      const args = [...request.path]
      if (request.body !== undefined) args.push('--json', JSON.stringify(request.body))
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
      })
      if (result.code !== 0) throw structuredFailure(result.stdout, result.code)
      return { value: parseJsonOutput(result.stdout), stderr: result.stderr }
    },
  }
}
