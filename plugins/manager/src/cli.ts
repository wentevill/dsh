import { delimiter } from 'node:path'
import { spawn } from 'node:child_process'
import { PluginManagerError } from './errors.ts'

export interface PrivateRuntimePaths {
  readonly node: string
  readonly dsh: string
  readonly packageBin: string
  readonly dshHome: string
}

export interface CommandResult {
  readonly code: number
  readonly stderr: string
}

export interface CommandOptions {
  readonly env: NodeJS.ProcessEnv
  readonly signal?: AbortSignal
}

export type CommandRunner = (
  command: string,
  args: readonly string[],
  options: CommandOptions,
) => Promise<CommandResult>

const MAX_DIAGNOSTIC_BYTES = 64 * 1024

export const runCommand: CommandRunner = async (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    env: options.env,
    signal: options.signal,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const chunks: Buffer[] = []
  let bytes = 0
  child.stderr.on('data', (chunk: Buffer) => {
    if (bytes >= MAX_DIAGNOSTIC_BYTES) return
    const remaining = MAX_DIAGNOSTIC_BYTES - bytes
    const bounded = chunk.subarray(0, remaining)
    chunks.push(bounded)
    bytes += bounded.length
  })
  child.once('error', reject)
  child.once('close', code => resolve({ code: code ?? 1, stderr: Buffer.concat(chunks).toString('utf8') }))
})

export class PluginCli {
  constructor(
    private readonly paths: PrivateRuntimePaths,
    private readonly runner: CommandRunner = runCommand,
  ) {}

  install(archivePath: string, signal?: AbortSignal): Promise<void> {
    return this.execute('INSTALL_FAILED', [
      this.paths.dsh, 'plugin', '--profile', 'web', 'add', '--ignore-scripts', archivePath,
    ], signal)
  }

  uninstall(packageName: string, signal?: AbortSignal): Promise<void> {
    return this.execute('UNINSTALL_FAILED', [
      this.paths.dsh, 'plugin', '--profile', 'web', 'remove', packageName,
    ], signal)
  }

  private async execute(
    code: 'INSTALL_FAILED' | 'UNINSTALL_FAILED',
    args: readonly string[],
    signal?: AbortSignal,
  ): Promise<void> {
    const env: NodeJS.ProcessEnv = { ...process.env }
    delete env.NODE_OPTIONS
    delete env.NODE_PATH
    env.DSH_HOME = this.paths.dshHome
    env.PATH = env.PATH
      ? `${this.paths.packageBin}${delimiter}${env.PATH}`
      : this.paths.packageBin
    let result: CommandResult
    try {
      result = await this.runner(this.paths.node, args, { env, signal })
    } catch (error) {
      throw new PluginManagerError(code, 'plugin operation could not start', { cause: error })
    }
    if (result.code !== 0) {
      throw new PluginManagerError(code, 'plugin operation failed')
    }
  }
}
