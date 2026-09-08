import type { CronExecutionId, CronId } from './brand.ts';
import type { CronLifecyclePort } from './commands.ts';
import type { CronLibrary } from './node-cron-runtime.ts';
import type { CronRecoveryState } from './store.ts';
import type { CronDefinition, CronExecution, CronRuntimeState } from './types.ts';
interface RuntimeStorePort {
    recover(): CronRecoveryState;
    beginExecution(execution: CronExecution): Promise<CronExecution>;
    putRuntime(runtime: CronRuntimeState): Promise<CronRuntimeState>;
}
interface RuntimeDependencies {
    readonly store: RuntimeStorePort;
    readonly library: Pick<CronLibrary, 'start'>;
    readonly dispatch: (execution: CronExecution, definition: CronDefinition) => Promise<void>;
    readonly registrationFailed?: (definition: CronDefinition) => void;
    readonly createExecutionId?: () => CronExecutionId;
    readonly now?: () => Date;
}
/** Owns live node-cron tasks and durable single-flight orchestration. */
export declare class CronRuntime implements CronLifecyclePort {
    private readonly dependencies;
    private readonly definitions;
    private readonly states;
    private readonly live;
    private readonly tails;
    private readonly createExecutionId;
    private readonly now;
    private disposed;
    constructor(dependencies: RuntimeDependencies);
    initialize(): Promise<void>;
    changed(previous: CronDefinition | undefined, next: CronDefinition, options: {
        readonly clearPending: boolean;
    }): Promise<void>;
    definitionChanged(previous: CronDefinition | undefined, next: CronDefinition, options: {
        readonly clearPending: boolean;
    }): Promise<void>;
    executionFinished(cronId: CronId, executionId: CronExecutionId): Promise<void>;
    dispose(): Promise<void>;
    private applyDefinitionChange;
    private register;
    private fire;
    private applyOccurrenceEffects;
    private applyControlEffects;
    private enqueue;
}
export {};
