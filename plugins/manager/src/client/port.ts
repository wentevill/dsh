import type {
  AppendChunkWireRequest, BeginUploadWireRequest, BeginUploadWireResult,
  CancelUploadWireResult, InstallResult, ListPluginsResult, UninstallResult,
  UninstallWireRequest, UploadProgressWireResult, UploadWireRequest,
} from '../remote-types.ts'
import type { ManagedPluginEntry } from '../profile.ts'

type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly message: string } }

export interface PluginManagerRemoteFace {
  readonly list: () => Promise<Result<ListPluginsResult>>
  readonly begin: (request: BeginUploadWireRequest) => Promise<Result<BeginUploadWireResult>>
  readonly append: (request: AppendChunkWireRequest) => Promise<Result<UploadProgressWireResult>>
  readonly finish: (request: UploadWireRequest, signal?: AbortSignal) => Promise<Result<InstallResult>>
  readonly cancel: (request: UploadWireRequest) => Promise<Result<CancelUploadWireResult>>
  readonly uninstall: (request: UninstallWireRequest, signal?: AbortSignal) => Promise<Result<UninstallResult>>
}

/** Upload progress report: bytes persisted vs. the total file size. */
export type InstallProgress = (received: number, size: number) => void

export interface PluginManagerPort {
  readonly list: () => Promise<ListPluginsResult>
  readonly install: (file: File, onProgress?: InstallProgress) => Promise<InstallResult>
  readonly uninstall: (entry: ManagedPluginEntry) => Promise<UninstallResult>
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

function base64(bytes: Uint8Array): string {
  let binary = ''
  const stride = 32 * 1024
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + stride))
  }
  return btoa(binary)
}

export function createPluginManagerPort(remote: PluginManagerRemoteFace): PluginManagerPort {
  return {
    list: async () => unwrap(await remote.list()),
    install: async (file, onProgress) => {
      const begun = unwrap(await remote.begin({ fileName: file.name, size: file.size }))
      try {
        let index = 0
        for (let offset = 0; offset < file.size; offset += begun.chunkSize) {
          const bytes = new Uint8Array(await file.slice(offset, offset + begun.chunkSize).arrayBuffer())
          unwrap(await remote.append({ uploadId: begun.uploadId, index, bytesBase64: base64(bytes) }))
          index += 1
          const received = Math.min(offset + begun.chunkSize, file.size)
          onProgress?.(received, file.size)
        }
        return unwrap(await remote.finish({ uploadId: begun.uploadId }))
      } catch (error) {
        try { unwrap(await remote.cancel({ uploadId: begun.uploadId })) } catch { /* upload may already be consumed */ }
        throw error
      }
    },
    uninstall: async entry => unwrap(await remote.uninstall({
      packageName: entry.packageName,
      expectedVersion: entry.version,
    })),
  }
}
