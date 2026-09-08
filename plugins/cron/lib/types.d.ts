import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types';
import type { CronExecutionId, CronId } from './brand.ts';
/** Identifier of one composed Agent preset captured from an invoking Session. */
export type AgentPresetId = string & {
    readonly __brand: 'agent-preset-id';
};
/** User-visible lifecycle of a Cron definition. */
export type CronDefinitionState = 'active' | 'paused' | 'deleted';
interface CronDefinitionBase {
    readonly id: CronId;
    readonly workspaceId: WorkspaceId;
    readonly name: string;
    readonly expression: string;
    readonly timezone: string;
    readonly prompt: string;
    readonly createdFromSessionId: SessionId;
    readonly state: CronDefinitionState;
    readonly revision: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly deletedAt?: string;
}
/** Durable Cron definition with one valid execution target. */
export type CronDefinition = CronDefinitionBase & ({
    readonly executionMode: 'existing_session';
    readonly targetSessionId: SessionId;
    readonly agentPresetId?: never;
} | {
    readonly executionMode: 'new_session';
    readonly agentPresetId: AgentPresetId;
    readonly targetSessionId?: never;
});
/** One scheduled instant entering the single-flight state machine. */
export interface CronOccurrence {
    readonly trigger: 'on_time' | 'startup_catch_up' | 'pending_after_run';
    readonly scheduledFor: string;
    readonly observedAt: string;
    readonly delayed: boolean;
    readonly coalescedThrough?: string;
}
/** Durable scheduler state kept separate from user-editable definition data. */
export interface CronRuntimeState {
    readonly cronId: CronId;
    readonly libraryNextRunAt?: string;
    readonly observedAt: string;
    readonly activeExecutionId?: CronExecutionId;
    readonly pendingOccurrence?: CronOccurrence;
}
/** Stable bounded failure vocabulary exposed by the plugin. */
export type CronFailureCode = 'cron_not_found' | 'invalid_expression' | 'invalid_timezone' | 'workspace_context_unavailable' | 'target_session_unavailable' | 'agent_preset_unavailable' | 'model_unavailable' | 'prompt_rejected' | 'persistence_unavailable' | 'internal_error';
/** Durable outcome of one occurrence. */
export interface CronExecution {
    readonly id: CronExecutionId;
    readonly cronId: CronId;
    readonly trigger: CronOccurrence['trigger'];
    readonly scheduledFor?: string;
    readonly delayed: boolean;
    readonly coalescedThrough?: string;
    readonly state: 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'cancelled' | 'coalesced';
    readonly sessionId?: SessionId;
    readonly sessionRequestId?: SessionRequestId;
    readonly failureCode?: CronFailureCode;
    readonly startedAt?: string;
    readonly finishedAt?: string;
}
export {};
