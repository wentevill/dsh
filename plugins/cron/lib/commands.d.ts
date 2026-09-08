import type { Context } from '@deepseek-ai/cordis';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace';
import { CronId } from './brand.ts';
import type { CronLibrary } from './node-cron-runtime.ts';
import type { HistoryPage, HistoryQuery } from './store.ts';
import type { CronDefinition } from './types.ts';
interface SessionControllerPort {
    resolveAgent(sessionId: SessionId): Promise<{
        readonly agent: {
            readonly ctx: Context;
        };
    } | {
        readonly error: unknown;
    }>;
}
interface AgentPresetsPort {
    composedPreset(agentCtx: Context): string | undefined;
}
interface CronStorePort {
    createDefinition(value: CronDefinition): Promise<CronDefinition>;
    updateDefinition(id: CronId, revision: number, change: (value: CronDefinition) => CronDefinition): Promise<CronDefinition>;
    listDefinitions(): readonly CronDefinition[];
    listHistory(query?: HistoryQuery): HistoryPage;
}
export interface CronLifecyclePort {
    changed(previous: CronDefinition | undefined, next: CronDefinition, options: {
        readonly clearPending: boolean;
    }): Promise<void>;
}
export interface CronCommandDependencies {
    readonly workspaceRegistry: Pick<WorkspaceRegistry, 'list'>;
    readonly sessionController: SessionControllerPort;
    readonly agentPresets: AgentPresetsPort;
    readonly library: Pick<CronLibrary, 'validate'>;
    readonly store: CronStorePort;
    readonly lifecycle?: CronLifecyclePort;
    readonly createId?: () => CronId;
    readonly now?: () => Date;
}
interface DefinitionInput {
    readonly name: string;
    readonly expression: string;
    readonly timezone: string;
    readonly prompt: string;
}
export type CronCreateInput = DefinitionInput & {
    readonly executionMode: CronDefinition['executionMode'];
};
export type CronUpdateInput = Partial<DefinitionInput> & {
    readonly executionMode?: CronDefinition['executionMode'];
};
export type CronListScope = 'related' | 'all' | 'deleted';
/** Workspace-authorized entry point shared by Tools and Client Remotes. */
export declare class CronCommandService {
    private readonly dependencies;
    private readonly lifecycle;
    private readonly createId;
    private readonly now;
    private readonly tails;
    constructor(dependencies: CronCommandDependencies);
    create(sessionId: SessionId, input: CronCreateInput): Promise<CronDefinition>;
    update(sessionId: SessionId, id: CronId, expectedRevision: number, input: CronUpdateInput): Promise<CronDefinition>;
    private updateNow;
    pause(sessionId: SessionId, id: CronId): Promise<CronDefinition>;
    resume(sessionId: SessionId, id: CronId): Promise<CronDefinition>;
    delete(sessionId: SessionId, id: CronId): Promise<CronDefinition>;
    list(sessionId: SessionId, scope: CronListScope): Promise<readonly CronDefinition[]>;
    history(sessionId: SessionId, id: CronId, query?: Omit<HistoryQuery, 'cronId'>): HistoryPage;
    private changeState;
    private definitionFor;
    private captureTarget;
    private assertRule;
    private executionCronIdsFor;
    private enqueue;
}
export {};
