import type { CronFailureCode } from './types.ts';
/** Public error carrying no caught implementation detail. */
export declare class CronFailure extends Error {
    readonly code: CronFailureCode;
    readonly name = "CronFailure";
    constructor(code: CronFailureCode);
}
/** Create one bounded public Cron failure. */
export declare function cronFailure(code: CronFailureCode): CronFailure;
