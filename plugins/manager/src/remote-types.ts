import type { ManagedPluginEntry } from './profile.ts'
import type { InstallResult, UninstallResult } from './service.ts'

export interface ListPluginsResult {
  readonly entries: readonly ManagedPluginEntry[]
}

export interface BeginUploadWireRequest {
  readonly fileName: string
  readonly size: number
}

export interface BeginUploadWireResult {
  readonly uploadId: string
  readonly chunkSize: number
}

export interface AppendChunkWireRequest {
  readonly uploadId: string
  readonly index: number
  readonly bytesBase64: string
}

export interface UploadProgressWireResult {
  readonly received: number
  readonly size: number
}

export interface UploadWireRequest {
  readonly uploadId: string
}

export interface CancelUploadWireResult {
  readonly cancelled: true
}

export interface UninstallWireRequest {
  readonly packageName: string
  readonly expectedVersion: string
}

export type { InstallResult, UninstallResult }
