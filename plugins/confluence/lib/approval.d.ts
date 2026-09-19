import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
export interface ConfluenceApprovalPreparer {
    ownsMutation?(name: string): boolean;
    prepareMutation(exec: Readonly<ToolExecution>): Promise<{
        reason: string;
    }>;
}
export declare function createConfluenceApprovalPolicy(preparer: ConfluenceApprovalPreparer): (exec: Readonly<ToolExecution>, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>;
