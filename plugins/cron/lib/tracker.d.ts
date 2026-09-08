import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { CronExecutionId, CronId } from './brand.ts';
import type { CronExecution, CronFailureCode } from './types.ts';
interface TrackerStorePort {
    updateExecution(id: CronExecutionId, change: (execution: CronExecution) => CronExecution): Promise<CronExecution>;
    finishExecution(id: CronExecutionId, state: 'succeeded' | 'failed' | 'cancelled' | 'coalesced', patch: {
        readonly failureCode?: CronFailureCode;
        readonly finishedAt: string;
    }): Promise<CronExecution>;
}
interface TrackerDependencies {
    readonly store: TrackerStorePort;
    readonly executionFinished: (cronId: CronId, executionId: CronExecutionId) => Promise<void>;
    readonly now?: () => Date;
}
export interface CronObservedEvent {
    readonly type: string;
    readonly seq: number;
    readonly time: number;
    readonly data: unknown;
}
/** Correlates Session journal events to durable Cron executions. */
export declare class CronExecutionTracker {
    private readonly dependencies;
    private readonly byRequest;
    private readonly bySession;
    private readonly openTurn;
    private readonly tails;
    private readonly now;
    private failure;
    constructor(dependencies: TrackerDependencies);
    track(execution: CronExecution): void;
    observe(session: SessionId | {
        readonly id: SessionId;
    }, event: CronObservedEvent): void;
    fail(execution: CronExecution, failureCode: CronFailureCode): Promise<void>;
    flush(): Promise<void>;
    dispose(): void;
    private queueTerminal;
    private finish;
    private untrack;
    private enqueue;
}
export {};
