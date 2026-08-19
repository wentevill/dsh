import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
import type { MailAddress } from './mail-types.ts';
export interface MailSendApprovalMetadata {
    readonly to: readonly MailAddress[];
    readonly cc: readonly MailAddress[];
    readonly bccCount: number;
    readonly subject: string;
    readonly formats: readonly ('text' | 'html')[];
    readonly attachments: readonly string[];
    readonly attachmentBytes: number;
}
export interface MailDeleteApprovalMetadata {
    readonly id: string;
    readonly subject: string;
    readonly from: readonly MailAddress[];
}
export interface MailApprovalPreparer {
    prepareSend(exec: Readonly<ToolExecution>): Promise<MailSendApprovalMetadata>;
    prepareDelete(exec: Readonly<ToolExecution>): Promise<MailDeleteApprovalMetadata>;
}
/** Fresh one-shot approval policy for Mail's two mutating operations. */
export declare function createMailApprovalPolicy(preparer: MailApprovalPreparer): (exec: Readonly<ToolExecution>, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>;
