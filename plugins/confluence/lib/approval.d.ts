import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
export interface ConfluenceApprovalPreparer {
    prepareMutation(exec: Readonly<ToolExecution>): Promise<{
        reason: string;
    }>;
}
export declare function createConfluenceApprovalPolicy(preparer: ConfluenceApprovalPreparer): (exec: Readonly<ToolExecution>, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>;
