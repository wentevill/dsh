import type { Context } from '@deepseek-ai/cordis';
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import type { NextcloudFileService } from './service.ts';
import type { NextcloudSharingService } from './sharing-service.ts';
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
    constructor(ctx: Pick<Context, 'tools'>, resolve: ResolveService, allowDelete: boolean);
    dispose(): void;
    release(exec: Readonly<ToolExecution>): void;
    prepare(exec: Readonly<ToolExecution>): Promise<string | undefined>;
    private prepareChecked;
    private consume;
    private definitions;
}
export declare function createNextcloudApprovalPolicy(manager: NextcloudToolManager): (exec: Readonly<ToolExecution>, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>;
