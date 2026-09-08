import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { CronCreateInput, CronListScope, CronUpdateInput } from './commands.ts';
import type { CronDefinitionState, CronExecution } from './types.ts';
/** Session-authorized list request from the browser client. */
export interface CronListRequest {
    readonly sessionId: SessionId;
    readonly scope: CronListScope;
}
/** Session-authorized execution history request. */
export interface CronHistoryRequest {
    readonly sessionId: SessionId;
    readonly cronId: string;
    readonly cursor?: string;
    readonly limit?: number;
}
/** Session-authorized create request; ownership targets remain Host-derived. */
export type CronCreateRequest = CronCreateInput & {
    readonly sessionId: SessionId;
};
/** Session-authorized optimistic update request. */
export type CronUpdateRequest = CronUpdateInput & {
    readonly sessionId: SessionId;
    readonly cronId: string;
    readonly expectedRevision: number;
};
/** Session-authorized request for a single Cron definition. */
export interface CronIdRequest {
    readonly sessionId: SessionId;
    readonly cronId: string;
}
export type CronDefinitionWire = {
    readonly id: string;
    readonly workspaceId: string;
    readonly name: string;
    readonly expression: string;
    readonly timezone: string;
    readonly prompt: string;
    readonly createdFromSessionId: string;
    readonly state: CronDefinitionState;
    readonly revision: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly deletedAt?: string;
} & ({
    readonly executionMode: 'existing_session';
    readonly targetSessionId: string;
} | {
    readonly executionMode: 'new_session';
    readonly agentPresetId: string;
});
export interface CronExecutionWire {
    readonly id: string;
    readonly cronId: string;
    readonly trigger: CronExecution['trigger'];
    readonly scheduledFor?: string;
    readonly delayed: boolean;
    readonly coalescedThrough?: string;
    readonly state: CronExecution['state'];
    readonly sessionId?: string;
    readonly sessionRequestId?: string;
    readonly failureCode?: CronExecution['failureCode'];
    readonly startedAt?: string;
    readonly finishedAt?: string;
}
export type CronListResult = readonly CronDefinitionWire[];
export interface CronHistoryResult {
    readonly items: readonly CronExecutionWire[];
    readonly nextCursor?: string;
}
export type CronMutationResult = CronDefinitionWire;
