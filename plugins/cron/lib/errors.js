const publicMessages = {
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
};
/** Public error carrying no caught implementation detail. */
export class CronFailure extends Error {
    code;
    name = 'CronFailure';
    constructor(code) {
        super(publicMessages[code]);
        this.code = code;
    }
}
/** Create one bounded public Cron failure. */
export function cronFailure(code) {
    return new CronFailure(code);
}
