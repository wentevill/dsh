import type { Context } from '@deepseek-ai/cordis';
import type { Credentials } from '@deepseek-ai/dsh-credentials';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { loadAttachments } from './attachment-loader.ts';
import type { MailSettings } from './mail-settings.ts';
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
export declare class MailCapabilityManager implements MailApprovalPreparer {
    private readonly ctx;
    private readonly scope;
    private readonly options;
    private settings;
    private revision;
    private readonly preparedSends;
    private readonly groupDisposers;
    private readonly unwatch;
    constructor(ctx: Pick<Context, 'tools' | 'effect'>, scope: SettingsScope<MailSettings>, options: ManagerOptions);
    dispose(): Promise<void>;
    prepareSend(exec: Readonly<ToolExecution>): Promise<MailSendApprovalMetadata>;
    prepareDelete(exec: Readonly<ToolExecution>): Promise<MailDeleteApprovalMetadata>;
    private imapEnabled;
    private smtpEnabled;
    private deleteEnabled;
    private withConfig;
    private remove;
    private install;
    private reconcile;
    private imapTools;
    private deleteTool;
    private sendTool;
}
export {};
