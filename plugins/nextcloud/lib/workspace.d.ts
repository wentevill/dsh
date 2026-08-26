import type { Readable } from 'node:stream';
export interface WorkspaceFileSnapshot {
    readonly path: string;
    readonly size: number;
    readonly sha256: string;
}
export declare function snapshotWorkspaceFile(workspace: string, input: string, signal?: AbortSignal): Promise<WorkspaceFileSnapshot>;
export declare function downloadIntoWorkspace(workspace: string, remotePath: string, input: Readable, explicitDestination?: string, signal?: AbortSignal): Promise<string>;
