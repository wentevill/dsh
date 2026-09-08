import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'

export type CronApprovalPolicy = (
  execution: ToolExecution,
  next: () => Promise<PreToolDecision>,
) => Promise<PreToolDecision>

const confirming = new Set(['cron_create', 'cron_update', 'cron_delete', 'cron_resume'])

/** Confirmation policy for model-originated Cron mutations. */
export function createCronApprovalPolicy(): CronApprovalPolicy {
  return async (execution, next) => {
    if (!confirming.has(execution.name)) return next()
    return { kind: 'ask', reason: confirmationReason(execution) }
  }
}

function confirmationReason(execution: ToolExecution): string {
  if (execution.name !== 'cron_create' && execution.name !== 'cron_update') {
    return execution.name === 'cron_delete'
      ? 'Delete this Cron task?'
      : 'Resume this Cron task?'
  }
  const args = typeof execution.arguments === 'object' && execution.arguments !== null
    ? execution.arguments as Record<string, unknown>
    : {}
  const name = typeof args['name'] === 'string' ? args['name'].trim().slice(0, 60) : 'Cron task'
  const expression = typeof args['expression'] === 'string'
    ? args['expression'].trim().replace(/\s+/gu, ' ').slice(0, 80)
    : undefined
  return expression === undefined
    ? `Change ${name}?`
    : `Change ${name} with schedule ${expression}?`
}
