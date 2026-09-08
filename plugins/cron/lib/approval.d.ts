import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools';
export type CronApprovalPolicy = (execution: ToolExecution, next: () => Promise<PreToolDecision>) => Promise<PreToolDecision>;
/** Confirmation policy for model-originated Cron mutations. */
export declare function createCronApprovalPolicy(): CronApprovalPolicy;
