/** Branded identifier of one durable Cron definition. */
export type CronId = string & { readonly __brand: 'cron-id' }

/** Branded identifier of one durable Cron execution. */
export type CronExecutionId = string & { readonly __brand: 'cron-execution-id' }

/** Convert a generated identifier into a Cron ID. */
export function CronId(value: string): CronId {
  if (value.length === 0) throw new TypeError('Cron ID must be non-empty')
  return value as CronId
}

/** Convert a generated identifier into a Cron execution ID. */
export function CronExecutionId(value: string): CronExecutionId {
  if (value.length === 0) throw new TypeError('Cron execution ID must be non-empty')
  return value as CronExecutionId
}
