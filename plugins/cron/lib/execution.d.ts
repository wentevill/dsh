import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkspaceId, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace';
import type { CronExecutionId } from './brand.ts';
import type { CronExecutionTracker } from './tracker.ts';
import type { CronDefinition, CronExecution } from './types.ts';
interface SessionLike {
    readonly id: SessionId;
    readonly events: readonly unknown[];
}
interface AgentLike {
    readonly session: SessionLike;
}
interface SessionControllerPort {
    create(request: {
        readonly sessionId: SessionId;
        readonly workspaceId: WorkspaceId;
        readonly agentPreset: string;
    }): Promise<{
        readonly sessionId: SessionId;
    }>;
    resolveAgent(sessionId: SessionId): Promise<{
        readonly agent: AgentLike;
    } | {
        readonly error: unknown;
    }>;
    prompt(request: {
        readonly requestId: SessionRequestId;
        readonly sessionId: SessionId;
        readonly mode: 'queue';
        readonly content: readonly [{
            readonly type: 'text';
            readonly text: string;
        }];
    }, signal: AbortSignal): Promise<{
        readonly accepted: true;
    }>;
    inspect(sessionId: SessionId): Promise<{
        readonly meta: unknown;
        readonly events: readonly unknown[];
    }>;
}
interface ExecutionStorePort {
    updateExecution(id: CronExecutionId, change: (execution: CronExecution) => CronExecution): Promise<CronExecution>;
}
interface PermissionPresetsPort {
    resolve(name: string): unknown;
    set(session: SessionLike, name: string): void;
}
interface ExecutionDependencies {
    readonly store: ExecutionStorePort;
    readonly sessionController: SessionControllerPort;
    readonly permissionPresets: PermissionPresetsPort;
    readonly workspaceRegistry: Pick<WorkspaceRegistry, 'get'>;
    readonly tracker: CronExecutionTracker;
    readonly now?: () => Date;
}
/** Derive a stable Session identity from one execution identity. */
export declare function sessionIdForExecution(executionId: CronExecutionId): SessionId;
/** Derive a stable prompt request identity from one execution identity. */
export declare function requestIdForExecution(executionId: CronExecutionId): SessionRequestId;
/** Dispatches and recovers Session work for durable Cron executions. */
export declare class CronExecutionService {
    private readonly dependencies;
    private readonly controllers;
    private readonly now;
    private disposed;
    constructor(dependencies: ExecutionDependencies);
    dispatch(execution: CronExecution, definition: CronDefinition): Promise<void>;
    recover(execution: CronExecution, definition: CronDefinition): Promise<void>;
    dispose(): Promise<void>;
    private submitPrepared;
    private fixedTargetStillOwned;
}
export {};
