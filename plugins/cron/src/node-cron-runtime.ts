import cron from 'node-cron'
import type { ScheduledTask, TaskContext } from 'node-cron'
import type { CronDefinition } from './types.ts'

export interface CronRule {
  readonly expression: string
  readonly timezone: string
}

export type CronValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: 'invalid_expression' | 'invalid_timezone' }

export interface LiveCron {
  start(): Promise<void>
  stop(): Promise<void>
  destroy(): Promise<void>
  nextRunAt(): Date | undefined
}

/** Narrow adapter keeping all schedule semantics inside node-cron. */
export class CronLibrary {
  validate(rule: CronRule): CronValidation {
    const expression = rule.expression.trim()
    if (expression.startsWith('@') || expression.split(/\s+/u).length !== 5) {
      return { ok: false, code: 'invalid_expression' }
    }
    if (!cron.validate(expression)) {
      return { ok: false, code: 'invalid_expression' }
    }
    try {
      const probe = cron.createTask(expression, () => {}, { timezone: rule.timezone })
      probe.match(new Date())
      void probe.destroy()
      return { ok: true }
    } catch {
      return { ok: false, code: 'invalid_timezone' }
    }
  }

  async start(
    definition: CronDefinition,
    onOccurrence: (scheduledFor: Date) => Promise<void>,
  ): Promise<LiveCron> {
    const task = cron.createTask(
      definition.expression,
      async (context: TaskContext) => onOccurrence(context.date),
      { name: definition.id, timezone: definition.timezone },
    )
    try {
      await task.start()
      return liveTask(task)
    } catch (error) {
      try { await task.destroy() } catch {}
      throw error
    }
  }
}

function liveTask(task: ScheduledTask): LiveCron {
  return {
    start: async () => { await task.start() },
    stop: async () => { await task.stop() },
    destroy: async () => { await task.destroy() },
    nextRunAt: () => task.getNextRun() ?? undefined,
  }
}
