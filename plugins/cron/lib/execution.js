import { createHash } from 'node:crypto';
/** Derive a stable Session identity from one execution identity. */
export function sessionIdForExecution(executionId) {
    return `cron-session-v1-${stableDigest('session', executionId)}`;
}
/** Derive a stable prompt request identity from one execution identity. */
export function requestIdForExecution(executionId) {
    return `cron-request-v1-${stableDigest('request', executionId)}`;
}
/** Dispatches and recovers Session work for durable Cron executions. */
export class CronExecutionService {
    dependencies;
    controllers = new Map();
    now;
    disposed = false;
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.now = dependencies.now ?? (() => new Date());
    }
    async dispatch(execution, definition) {
        const sessionId = definition.executionMode === 'existing_session'
            ? definition.targetSessionId
            : sessionIdForExecution(execution.id);
        const prepared = await this.dependencies.store.updateExecution(execution.id, value => ({
            ...value,
            sessionId,
            sessionRequestId: requestIdForExecution(execution.id),
            state: 'running',
            startedAt: value.startedAt ?? this.now().toISOString(),
        }));
        this.dependencies.tracker.track(prepared);
        await this.submitPrepared(prepared, definition);
    }
    async recover(execution, definition) {
        if (execution.sessionId === undefined || execution.sessionRequestId === undefined) {
            await this.dispatch(execution, definition);
            return;
        }
        this.dependencies.tracker.track(execution);
        let events;
        try {
            events = (await this.dependencies.sessionController.inspect(execution.sessionId)).events;
        }
        catch {
            await this.submitPrepared(execution, definition);
            return;
        }
        for (const event of events) {
            this.dependencies.tracker.observe(execution.sessionId, event);
        }
        await this.dependencies.tracker.flush();
        if (events.some(event => rpcIdOf(event) === execution.sessionRequestId))
            return;
        await this.submitPrepared(execution, definition);
    }
    async dispose() {
        this.disposed = true;
        for (const controller of this.controllers.values())
            controller.abort();
        await this.dependencies.tracker.flush();
        this.dependencies.tracker.dispose();
        this.controllers.clear();
    }
    async submitPrepared(execution, definition) {
        if (this.disposed)
            return;
        if (definition.executionMode === 'existing_session' && !this.fixedTargetStillOwned(definition)) {
            await this.dependencies.tracker.fail(execution, 'target_session_unavailable');
            return;
        }
        try {
            if (definition.executionMode === 'new_session') {
                await this.dependencies.sessionController.create({
                    sessionId: execution.sessionId,
                    workspaceId: definition.workspaceId,
                    agentPreset: definition.agentPresetId,
                });
            }
        }
        catch {
            await this.dependencies.tracker.fail(execution, 'target_session_unavailable');
            return;
        }
        let resolved;
        try {
            resolved = await this.dependencies.sessionController.resolveAgent(execution.sessionId);
        }
        catch {
            await this.dependencies.tracker.fail(execution, 'target_session_unavailable');
            return;
        }
        if ('error' in resolved) {
            await this.dependencies.tracker.fail(execution, 'target_session_unavailable');
            return;
        }
        if (definition.executionMode === 'new_session') {
            try {
                this.dependencies.permissionPresets.resolve('workspace-write');
                this.dependencies.permissionPresets.set(resolved.agent.session, 'workspace-write');
            }
            catch {
                await this.dependencies.tracker.fail(execution, 'internal_error');
                return;
            }
        }
        const controller = new AbortController();
        this.controllers.set(execution.id, controller);
        try {
            await this.dependencies.sessionController.prompt({
                sessionId: execution.sessionId,
                requestId: execution.sessionRequestId,
                mode: 'queue',
                content: [{ type: 'text', text: definition.prompt }],
            }, controller.signal);
        }
        catch {
            if (!this.disposed)
                await this.dependencies.tracker.fail(execution, 'prompt_rejected');
        }
        finally {
            this.controllers.delete(execution.id);
        }
    }
    fixedTargetStillOwned(definition) {
        const workspace = this.dependencies.workspaceRegistry.get(definition.workspaceId);
        return workspace !== undefined && workspace.sessionIds.includes(definition.targetSessionId);
    }
}
function stableDigest(kind, executionId) {
    return createHash('sha256')
        .update(`dsh-cron/${kind}/v1\0${executionId}`, 'utf8')
        .digest('base64url');
}
function rpcIdOf(event) {
    if (typeof event !== 'object' || event === null)
        return undefined;
    const record = event;
    if (record['type'] !== 'user/message')
        return undefined;
    const data = record['data'];
    if (typeof data !== 'object' || data === null)
        return undefined;
    const source = data['source'];
    if (typeof source !== 'object' || source === null)
        return undefined;
    const rpcId = source['rpcId'];
    return typeof rpcId === 'string' ? rpcId : undefined;
}
