import type { Readable } from 'node:stream';
import { type PathPolicySettings } from './path-policy.ts';
import type { RemoteEntry } from './transport.ts';
export interface NextcloudTransportPort {
    list(path: string, signal?: AbortSignal): Promise<RemoteEntry[]>;
    stat(path: string, signal?: AbortSignal): Promise<RemoteEntry>;
    search(input: {
        path: string;
        query: string;
        limit: number;
    }, signal?: AbortSignal): Promise<RemoteEntry[]>;
    readText(path: string, signal?: AbortSignal): Promise<string>;
    download(path: string, signal?: AbortSignal): Readable;
    upload(path: string, input: Readable, size: number, overwrite: boolean, signal?: AbortSignal): Promise<void>;
    mkdir(path: string, signal?: AbortSignal): Promise<void>;
    move(source: string, destination: string, overwrite: boolean, signal?: AbortSignal): Promise<void>;
    delete(path: string, signal?: AbortSignal): Promise<void>;
}
export type ReadResult = {
    readonly kind: 'text';
    readonly path: string;
    readonly text: string;
    readonly nextOffsetChars: number | null;
    readonly truncated: boolean;
} | {
    readonly kind: 'download';
    readonly remotePath: string;
    readonly localPath: string;
    readonly size: number;
    readonly mimeType?: string;
};
export declare class NextcloudFileService {
    private readonly transport;
    private readonly policy;
    private readonly defaultPath;
    constructor(transport: NextcloudTransportPort, settings: PathPolicySettings);
    list(path?: string, limitInput?: number, signal?: AbortSignal): Promise<{
        entries: RemoteEntry[];
        truncated: boolean;
    }>;
    stat(path: string, signal?: AbortSignal): Promise<RemoteEntry>;
    search(input: {
        path?: string;
        query: string;
        limit?: number;
    }, signal?: AbortSignal): Promise<{
        entries: RemoteEntry[];
        truncated: boolean;
    }>;
    validateUploadPath(path: string): string;
    validateMovePaths(source: string, destination: string): {
        source: string;
        destination: string;
    };
    validateDeletePath(path: string): string;
    read(pathInput: string, options?: {
        offsetChars?: number;
        maxChars?: number;
        workspace?: string;
        signal?: AbortSignal;
    }): Promise<ReadResult>;
    download(workspace: string, pathInput: string, localPath?: string, signal?: AbortSignal): Promise<{
        remotePath: string;
        localPath: string;
        size: number;
    }>;
    upload(workspace: string, localPath: string, remotePathInput: string, overwrite: boolean, signal?: AbortSignal): Promise<{
        remotePath: string;
        size: number;
        sha256: string;
    }>;
    mkdir(path: string, signal?: AbortSignal): Promise<void>;
    move(source: string, destination: string, overwrite: boolean, signal?: AbortSignal): Promise<void>;
    delete(path: string, signal?: AbortSignal): Promise<void>;
}
