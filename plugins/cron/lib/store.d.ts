import type { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import type { CronExecutionId, CronId } from './brand.ts';
import type { CronDefinition, CronExecution, CronFailureCode, CronRuntimeState } from './types.ts';
type StoreErrorCode = 'definition_deleted' | 'duplicate_definition' | 'duplicate_execution' | 'immutable_identity' | 'invalid_cursor' | 'revision_conflict';
/** Bounded error raised by durable store invariants. */
export declare class CronStoreError extends Error {
    readonly code: StoreErrorCode;
    readonly name = "CronStoreError";
    constructor(code: StoreErrorCode);
}
export interface HistoryQuery {
    readonly cronId?: CronId;
    readonly cursor?: string;
    readonly limit?: number;
}
export interface HistoryPage {
    readonly items: readonly CronExecution[];
    readonly nextCursor?: string;
}
export interface CronRecoveryState {
    readonly activeDefinitions: readonly CronDefinition[];
    readonly runtime: readonly CronRuntimeState[];
    readonly nonterminalExecutions: readonly CronExecution[];
    readonly orphanRuntime: readonly CronRuntimeState[];
    readonly orphanExecutions: readonly CronExecution[];
}
type TerminalState = Extract<CronExecution['state'], 'succeeded' | 'failed' | 'cancelled' | 'coalesced'>;
interface FinishPatch {
    readonly sessionId?: CronExecution['sessionId'];
    readonly sessionRequestId?: CronExecution['sessionRequestId'];
    readonly failureCode?: CronFailureCode;
    readonly startedAt?: string;
    readonly finishedAt: string;
}
/** Durable Cron storage over one plugin-owned storage domain. */
export declare class CronStore {
    private readonly domain;
    private readonly definitions;
    private readonly runtime;
    private readonly executions;
    private constructor();
    static open(ctx: {
        readonly storageDomain: DomainFacility;
    }): Promise<CronStore>;
    createDefinition(definition: CronDefinition): Promise<CronDefinition>;
    updateDefinition(id: CronId, expectedRevision: number, change: (current: CronDefinition) => CronDefinition): Promise<CronDefinition>;
    putRuntime(runtime: CronRuntimeState): Promise<CronRuntimeState>;
    beginExecution(execution: CronExecution): Promise<CronExecution>;
    updateExecution(id: CronExecutionId, change: (current: CronExecution) => CronExecution): Promise<CronExecution>;
    finishExecution(id: CronExecutionId, state: TerminalState, patch: FinishPatch): Promise<CronExecution>;
    listDefinitions(scope?: 'active' | 'deleted' | 'all'): readonly CronDefinition[];
    listHistory(query?: HistoryQuery): HistoryPage;
    recover(): CronRecoveryState;
    close(): Promise<void>;
}
export {};
