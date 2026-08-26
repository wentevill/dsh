import type { PluginCli } from './cli.ts';
import { type ManagedPluginEntry } from './profile.ts';
import { type InstallAction } from './version.ts';
export interface BeginUploadRequest {
    readonly fileName: string;
    readonly size: number;
}
export interface BeginUploadResult {
    readonly uploadId: string;
    readonly chunkSize: number;
}
export interface AppendChunkRequest {
    readonly uploadId: string;
    readonly index: number;
    readonly bytes: Uint8Array;
}
export interface UploadProgress {
    readonly received: number;
    readonly size: number;
}
export interface UploadRequest {
    readonly uploadId: string;
}
export interface InstallResult {
    readonly action: Exclude<InstallAction, 'downgrade'>;
    readonly packageName: string;
    readonly version: string;
    readonly requiresRestart: true;
}
export interface UninstallRequest {
    readonly packageName: string;
    readonly expectedVersion: string;
}
export interface UninstallResult {
    readonly packageName: string;
    readonly version: string;
    readonly requiresRestart: true;
}
export interface PluginManagerServiceOptions {
    readonly profileDir: string;
    readonly uploadRoot: string;
    readonly cli: PluginCli;
}
export declare class PluginManagerService {
    private readonly options;
    private session;
    private operating;
    constructor(options: PluginManagerServiceOptions);
    list(): Promise<ManagedPluginEntry[]>;
    begin(request: BeginUploadRequest): Promise<BeginUploadResult>;
    append(request: AppendChunkRequest): Promise<UploadProgress>;
    finish(request: UploadRequest, signal?: AbortSignal): Promise<InstallResult>;
    cancel(request: UploadRequest): Promise<{
        cancelled: true;
    }>;
    uninstall(request: UninstallRequest, signal?: AbortSignal): Promise<UninstallResult>;
    dispose(): Promise<void>;
    private requireSession;
    private close;
    private cleanup;
}
