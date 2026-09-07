import type { CronFailureCode } from './types.ts'

const publicMessages: Record<CronFailureCode, string> = {
  cron_not_found: 'Cron task not found.',
  invalid_expression: 'Cron expression is invalid.',
  invalid_timezone: 'Cron timezone is invalid.',
  workspace_context_unavailable: 'Workspace context is unavailable.',
  target_session_unavailable: 'Target Session is unavailable.',
  agent_preset_unavailable: 'Agent preset is unavailable.',
  model_unavailable: 'Model is unavailable.',
  prompt_rejected: 'Cron prompt was rejected.',
  persistence_unavailable: 'Cron persistence is unavailable.',
  internal_error: 'Cron operation failed.',
}

/** Public error carrying no caught implementation detail. */
export class CronFailure extends Error {
  override readonly name = 'CronFailure'

  constructor(readonly code: CronFailureCode) {
    super(publicMessages[code])
  }
}

/** Create one bounded public Cron failure. */
export function cronFailure(code: CronFailureCode): CronFailure {
  return new CronFailure(code)
}
