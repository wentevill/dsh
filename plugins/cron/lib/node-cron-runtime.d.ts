import type { CronDefinition } from './types.ts';
export interface CronRule {
    readonly expression: string;
    readonly timezone: string;
}
export type CronValidation = {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly code: 'invalid_expression' | 'invalid_timezone';
};
export interface LiveCron {
    start(): Promise<void>;
    stop(): Promise<void>;
    destroy(): Promise<void>;
    nextRunAt(): Date | undefined;
}
/** Narrow adapter keeping all schedule semantics inside node-cron. */
export declare class CronLibrary {
    validate(rule: CronRule): CronValidation;
    start(definition: CronDefinition, onOccurrence: (scheduledFor: Date) => Promise<void>): Promise<LiveCron>;
}
