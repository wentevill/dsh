import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { PluginCli } from './cli.ts'
import { PluginManagerError } from './errors.ts'
import type {
  AppendChunkWireRequest, BeginUploadWireRequest, BeginUploadWireResult,
  CancelUploadWireResult, InstallResult, ListPluginsResult,
  UninstallResult, UninstallWireRequest, UploadProgressWireResult, UploadWireRequest,
} from './remote-types.ts'
import { resolvePrivateRuntime } from './runtime.ts'
import { PluginManagerService } from './service.ts'

function decodeChunk(value: string): Uint8Array {
  if (value.length === 0 || value.length > 2 * 1024 * 1024) {
    throw new PluginManagerError('UPLOAD_INVALID', 'upload chunk encoding is invalid')
  }
  const bytes = Buffer.from(value, 'base64')
  const canonical = bytes.toString('base64').replace(/=+$/u, '')
  if (canonical !== value.replace(/=+$/u, '')) {
    throw new PluginManagerError('UPLOAD_INVALID', 'upload chunk encoding is invalid')
  }
  return bytes
}

export class PluginManagerRemote extends TypertRemoteService {
  constructor(ctx: Context, private readonly manager: PluginManagerService) {
    super(ctx, 'pluginManager')
  }

  @Remote('list')
  async list(): Promise<ListPluginsResult> {
    return { entries: await this.manager.list() }
  }

  @Remote('begin')
  begin(request: BeginUploadWireRequest): Promise<BeginUploadWireResult> {
    return this.manager.begin(request)
  }

  @Remote('append')
  append(request: AppendChunkWireRequest): Promise<UploadProgressWireResult> {
    return this.manager.append({
      uploadId: request.uploadId,
      index: request.index,
      bytes: decodeChunk(request.bytesBase64),
    })
  }

  @Remote('finish')
  finish(request: UploadWireRequest, signal?: AbortSignal): Promise<InstallResult> {
    return this.manager.finish(request, signal)
  }

  @Remote('cancel')
  cancel(request: UploadWireRequest): Promise<CancelUploadWireResult> {
    return this.manager.cancel(request)
  }

  @Remote('uninstall')
  uninstall(request: UninstallWireRequest, signal?: AbortSignal): Promise<UninstallResult> {
    return this.manager.uninstall(request, signal)
  }
}

export async function apply(ctx: Context): Promise<() => Promise<void>> {
  const runtime = await resolvePrivateRuntime({
    execPath: process.execPath,
    argv1: process.argv[1],
    dshHome: process.env.DSH_HOME,
  })
  const profileDir = join(runtime.dshHome, 'profiles', 'web')
  const uploadRoot = join(runtime.dshHome, '.plugin-manager', 'uploads')
  const manager = new PluginManagerService({ profileDir, uploadRoot, cli: new PluginCli(runtime) })
  new PluginManagerRemote(ctx, manager)
  return async () => { await manager.dispose() }
}

export type * from './remote-types.ts'
export { PluginManagerService } from './service.ts'
