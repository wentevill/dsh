import { createCronApprovalPolicy } from "./approval.js";
import { CronCommandService } from "./commands.js";
import { CronExecutionService } from "./execution.js";
import { CronLibrary } from "./node-cron-runtime.js";
import { CronRemote } from "./remote.js";
import { CronRuntime } from "./runtime.js";
import { CronStore } from "./store.js";
import { createCronTools } from "./tools.js";
import { CronExecutionTracker } from "./tracker.js";
export * from "./brand.js";
export * from "./approval.js";
export * from "./commands.js";
export * from "./domain.js";
export * from "./errors.js";
export * from "./execution.js";
export * from "./node-cron-runtime.js";
export * from "./remote.js";
export * from "./runtime.js";
export * from "./state-machine.js";
export * from "./store.js";
export * from "./timezone.js";
export * from "./tools.js";
export * from "./tracker.js";
export * from "./workspace.js";
export const name = 'cron';
export const inject = [
    'tools', 'storageDomain', 'workspaceRegistry', 'sessionController',
    'permissionPresets', 'agentPresets', 'sessions',
];
/** Compose the standalone Cron Host from public Harness plugin services. */
export async function apply(ctx) {
    const logger = ctx.logger('cron');
    const store = await CronStore.open(ctx);
    let runtime;
    let execution;
    let stopSessionEvents;
    let stopApproval;
    const stopTools = [];
    const tracker = new CronExecutionTracker({
        store,
        executionFinished: (cronId, executionId) => runtime.executionFinished(cronId, executionId),
    });
    execution = new CronExecutionService({
        store,
        sessionController: ctx.sessionController,
        permissionPresets: ctx.permissionPresets,
        workspaceRegistry: ctx.workspaceRegistry,
        tracker,
    });
    const library = new CronLibrary();
    runtime = new CronRuntime({
        store,
        library,
        dispatch: (item, definition) => execution.dispatch(item, definition),
        registrationFailed: () => logger.warn('operation=register outcome=failed reason=library_rejected_definition'),
    });
    const commands = new CronCommandService({
        workspaceRegistry: ctx.workspaceRegistry,
        sessionController: ctx.sessionController,
        agentPresets: ctx.agentPresets,
        library,
        store,
        lifecycle: runtime,
    });
    const dispose = async () => {
        const failures = [];
        const failed = (operation, error) => {
            failures.push(error);
            logger.warn(`operation=${operation} outcome=failed reason=dispose_failed`);
        };
        for (const stop of stopTools.splice(0).reverse()) {
            try {
                stop();
            }
            catch (error) {
                failed('tool_dispose', error);
            }
        }
        try {
            stopApproval?.();
        }
        catch (error) {
            failed('approval_dispose', error);
        }
        stopApproval = undefined;
        try {
            stopSessionEvents?.();
        }
        catch (error) {
            failed('session_observer_dispose', error);
        }
        stopSessionEvents = undefined;
        for (const [operation, close] of [
            ['runtime_dispose', () => runtime.dispose()],
            ['execution_dispose', () => execution.dispose()],
            ['store_close', () => store.close()],
        ]) {
            try {
                await close();
            }
            catch (error) {
                failed(operation, error);
            }
        }
        if (failures.length > 0)
            throw new Error('Cron Host disposal failed');
    };
    try {
        stopSessionEvents = ctx.on('session/event', (session, event) => {
            tracker.observe(session, event);
        });
        const recovery = store.recover();
        await runtime.initialize();
        const definitions = new Map(store.listDefinitions('all').map(value => [value.id, value]));
        for (const item of recovery.nonterminalExecutions) {
            const definition = definitions.get(item.cronId);
            if (definition !== undefined)
                await execution.recover(item, definition);
            else
                await tracker.fail(item, 'internal_error');
        }
        for (const tool of createCronTools(commands))
            stopTools.push(ctx.tools.register(tool));
        const approval = createCronApprovalPolicy();
        stopApproval = ctx.on('tools/pre-execute', (tool, next) => approval(tool, next));
        new CronRemote(ctx, commands);
        ctx.effect(() => dispose, 'cron.host');
    }
    catch (error) {
        try {
            await dispose();
        }
        catch { }
        throw error;
    }
}
