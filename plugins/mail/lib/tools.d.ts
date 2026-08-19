import type { Context } from '@deepseek-ai/cordis';
import type { Credentials } from '@deepseek-ai/dsh-credentials';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { loadAttachments } from './attachment-loader.ts';
import { type MailSettings } from './mail-settings.ts';
import type { MailApprovalPreparer, MailDeleteApprovalMetadata, MailSendApprovalMetadata } from './approval.ts';
import type { MailTransport, ResolvedConfig } from './index.ts';
interface ManagerOptions {
    credentials: Credentials;
    resolveConfig(settings: MailSettings): ResolvedConfig;
    imap: Pick<MailTransport, 'list' | 'read' | 'archive' | 'delete'>;
    smtp: Pick<MailTransport, 'send'>;
    loadAttachments?: typeof loadAttachments;
    listMaxResults: number;
    readMaxChars: number;
    maxRecipients: number;
    maxBodyChars: number;
}
/** Owns the live Mail tool catalog and binds destructive approvals to authoritative settings snapshots. */
export declare class MailCapabilityManager implements MailApprovalPreparer {
    private readonly ctx;
    private readonly scope;
    private readonly options;
    private readonly bindings;
    private readonly abortBindings;
    private readonly groupDisposers;
    private readonly unwatch;
    private disposed;
    private generation;
    private disposePromise;
    constructor(ctx: Pick<Context, 'tools' | 'effect'>, scope: SettingsScope<MailSettings>, options: ManagerOptions);
    dispose(): Promise<void>;
    /** Clear approval state on every tools/result outcome, including denial/cancellation. */
    releaseApproval(exec: Readonly<ToolExecution>): void;
    /** @internal Test-only diagnostic; bindings contain sanitized fingerprints only. */
    approvalBindingCountForTests(): number;
    /** @internal Test-only diagnostic for leak-free abort listener ownership. */
    approvalListenerCountForTests(): number;
    prepareSend(exec: Readonly<ToolExecution>): Promise<MailSendApprovalMetadata>;
    prepareDelete(exec: Readonly<ToolExecution>): Promise<MailDeleteApprovalMetadata>;
    private bind;
    private releaseToken;
    private assertActive;
    private authoritative;
    private requireSameSettings;
    private withSnapshot;
    private withCurrent;
    private remove;
    private install;
    private installCatalog;
    private reconcile;
    private imapTools;
    private deleteTool;
    private sendTool;
}
export {};
