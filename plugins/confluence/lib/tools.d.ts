import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type { ToolDefinition, ToolExecution } from '@deepseek-ai/dsh-tools';
import { type ConfluenceSettings } from './settings.ts';
import type { ConfluenceApprovalPreparer } from './approval.ts';
import type { FetchConfluenceTransport } from './transport.ts';
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
interface ManagerOptions {
    tools: ToolRegistryLike;
    scope: SettingsScopeLike;
    credentials: CredentialsLike;
    transport: Pick<FetchConfluenceTransport, 'searchPages' | 'readPage' | 'createPage' | 'updatePage'>;
}
export declare class ConfluenceCapabilityManager implements ConfluenceApprovalPreparer {
    private readonly options;
    private readonly disposers;
    private readonly bindings;
    private settingsAbort;
    private readonly unwatch;
    private disposed;
    constructor(options: ManagerOptions);
    dispose(): Promise<void>;
    releaseApproval(exec: Readonly<ToolExecution>): void;
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
}
export {};
