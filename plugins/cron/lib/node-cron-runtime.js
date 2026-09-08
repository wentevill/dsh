import cron from 'node-cron';
/** Narrow adapter keeping all schedule semantics inside node-cron. */
export class CronLibrary {
    validate(rule) {
        const expression = rule.expression.trim();
        if (expression.startsWith('@') || expression.split(/\s+/u).length !== 5) {
            return { ok: false, code: 'invalid_expression' };
        }
        if (!cron.validate(expression)) {
            return { ok: false, code: 'invalid_expression' };
        }
        try {
            const probe = cron.createTask(expression, () => { }, { timezone: rule.timezone });
            probe.match(new Date());
            void probe.destroy();
            return { ok: true };
        }
        catch {
            return { ok: false, code: 'invalid_timezone' };
        }
    }
    async start(definition, onOccurrence) {
        const task = cron.createTask(definition.expression, async (context) => onOccurrence(context.date), { name: definition.id, timezone: definition.timezone });
        try {
            await task.start();
            return liveTask(task);
        }
        catch (error) {
            try {
                await task.destroy();
            }
            catch { }
            throw error;
        }
    }
}
function liveTask(task) {
    return {
        start: async () => { await task.start(); },
        stop: async () => { await task.stop(); },
        destroy: async () => { await task.destroy(); },
        nextRunAt: () => task.getNextRun() ?? undefined,
    };
}
