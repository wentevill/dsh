import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { AppendChunkWireRequest, BeginUploadWireRequest, BeginUploadWireResult, CancelUploadWireResult, InstallResult, ListPluginsResult, UninstallResult, UninstallWireRequest, UploadProgressWireResult, UploadWireRequest } from './remote-types.ts';
import { PluginManagerService } from './service.ts';
export declare class PluginManagerRemote extends TypertRemoteService {
    private readonly manager;
    constructor(ctx: Context, manager: PluginManagerService);
    list(): Promise<ListPluginsResult>;
    begin(request: BeginUploadWireRequest): Promise<BeginUploadWireResult>;
    append(request: AppendChunkWireRequest): Promise<UploadProgressWireResult>;
    finish(request: UploadWireRequest, signal?: AbortSignal): Promise<InstallResult>;
    cancel(request: UploadWireRequest): Promise<CancelUploadWireResult>;
    uninstall(request: UninstallWireRequest, signal?: AbortSignal): Promise<UninstallResult>;
}
export declare function apply(ctx: Context): Promise<() => Promise<void>>;
export type * from './remote-types.ts';
export { PluginManagerService } from './service.ts';
