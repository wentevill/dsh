/** Convert a generated identifier into a Cron ID. */
export function CronId(value) {
    if (value.length === 0)
        throw new TypeError('Cron ID must be non-empty');
    return value;
}
/** Convert a generated identifier into a Cron execution ID. */
export function CronExecutionId(value) {
    if (value.length === 0)
        throw new TypeError('Cron execution ID must be non-empty');
    return value;
}
