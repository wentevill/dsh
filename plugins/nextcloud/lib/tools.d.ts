import type { Context } from '@deepseek-ai/cordis';
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import type { NextcloudFileService } from './service.ts';
import type { NextcloudSharingService } from './sharing-service.ts';
export interface NextcloudRuntime {
    readonly resolve: ResolveService;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        nextcloudRuntime: NextcloudRuntime;
    }
}
export interface ServiceSnapshot {
    readonly service: NextcloudFileService;
    readonly sharing: NextcloudSharingService;
    /** Hash of effective settings and the currently resolved credential. */
    readonly fingerprint: string;
}
export type ResolveService = () => Promise<ServiceSnapshot>;
export declare class NextcloudToolManager {
    private readonly resolve;
    private readonly bindings;
    private readonly disposers;
    private readonly toolNames;
    constructor(ctx: Pick<Context, 'tools'>, resolve: ResolveService, component?: 'standard' | 'delete');
    dispose(): void;
    release(exec: Readonly<ToolExecution>): void;
    owns(name: string): boolean;
    prepare(exec: Readonly<ToolExecution>): Promise<string | undefined>;
    private prepareChecked;
    private consume;
    private definitions;
}
export declare function createNextcloudApprovalPolicy(manager: NextcloudToolManager): (exec: Readonly<ToolExecution>, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>;
/** Mount the independently switchable file-deletion tool component. */
export declare function mountNextcloudDeleteComponent(ctx: Context): void;
