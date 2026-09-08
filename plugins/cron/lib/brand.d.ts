/** Branded identifier of one durable Cron definition. */
export type CronId = string & {
    readonly __brand: 'cron-id';
};
/** Branded identifier of one durable Cron execution. */
export type CronExecutionId = string & {
    readonly __brand: 'cron-execution-id';
};
/** Convert a generated identifier into a Cron ID. */
export declare function CronId(value: string): CronId;
/** Convert a generated identifier into a Cron execution ID. */
export declare function CronExecutionId(value: string): CronExecutionId;
