import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type { ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools';
import { type ConfluenceSettings } from './settings.ts';
import { type ConfluenceApprovalPreparer } from './approval.ts';
import type { FetchConfluenceTransport } from './transport.ts';
import type { Context } from '@deepseek-ai/cordis';
interface SettingsScopeLike {
    get(): ConfluenceSettings;
    watch(listener: () => void | Promise<void>): () => void;
}
interface CredentialsLike {
    resolve(reference: ReturnType<typeof credentialRef>): Promise<{
        value: string;
    } | undefined>;
}
interface ToolRegistryLike {
    register(definition: ToolDefinition): () => void | Promise<void>;
}
export interface ConfluenceManagerOptions {
    tools: ToolRegistryLike;
    scope: SettingsScopeLike;
    credentials: CredentialsLike;
    transport: Pick<FetchConfluenceTransport, 'searchPages' | 'readPage' | 'createPage' | 'updatePage' | 'deletePage'>;
}
export interface ConfluenceRuntime {
    readonly options: ConfluenceManagerOptions;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        confluenceRuntime: ConfluenceRuntime;
    }
}
export declare class ConfluenceCapabilityManager implements ConfluenceApprovalPreparer {
    private readonly options;
    private readonly component;
    private readonly disposers;
    private readonly bindings;
    private settingsAbort;
    private readonly unwatch;
    private disposed;
    constructor(options: ConfluenceManagerOptions, component?: 'standard' | 'delete');
    dispose(): Promise<void>;
    releaseApproval(exec: Readonly<ToolExecution>): void;
    ownsMutation(name: string): boolean;
    prepareMutation(exec: Readonly<ToolExecution>): Promise<{
        reason: string;
    }>;
    private assertActive;
    private configured;
    private currentSettings;
    private reconcileSync;
    private reconcile;
    private requireSpace;
    private assertSettings;
    private operationSignal;
    private connection;
    private takeApproval;
    private definitions;
    private searchTool;
    private readTool;
    private createTool;
    private updateTool;
    private deleteTool;
}
export declare function mountConfluenceDeleteComponent(ctx: Context): void;
export {};
