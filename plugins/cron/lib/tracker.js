/** Correlates Session journal events to durable Cron executions. */
export class CronExecutionTracker {
    dependencies;
    byRequest = new Map();
    bySession = new Map();
    openTurn = new Map();
    tails = new Map();
    now;
    failure;
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.now = dependencies.now ?? (() => new Date());
    }
    track(execution) {
        if (execution.sessionId === undefined || execution.sessionRequestId === undefined)
            return;
        const tracked = { execution };
        this.byRequest.set(execution.sessionRequestId, tracked);
        const session = this.bySession.get(execution.sessionId) ?? new Set();
        session.add(tracked);
        this.bySession.set(execution.sessionId, session);
    }
    observe(session, event) {
        const sessionId = typeof session === 'string' ? session : session.id;
        if (event.type === 'turn/start') {
            const turn = numberField(event.data, 'turn');
            if (turn !== undefined)
                this.openTurn.set(sessionId, turn);
            return;
        }
        if (event.type === 'user/message') {
            const requestId = rpcIdOf(event.data);
            const tracked = requestId === undefined ? undefined : this.byRequest.get(requestId);
            const turn = this.openTurn.get(sessionId);
            if (tracked !== undefined && tracked.execution.sessionId === sessionId && turn !== undefined) {
                tracked.turn = turn;
            }
            return;
        }
        if (event.type === 'turn/end') {
            const turn = numberField(event.data, 'turn');
            const reason = objectField(event.data, 'reason');
            if (turn !== undefined && reason !== undefined) {
                for (const tracked of this.bySession.get(sessionId) ?? []) {
                    if (tracked.turn === turn)
                        this.queueTerminal(tracked, reason);
                }
            }
            if (this.openTurn.get(sessionId) === turn)
                this.openTurn.delete(sessionId);
            return;
        }
        if (event.type !== 'approval/asked' && event.type !== 'approval/decided')
            return;
        const turn = this.openTurn.get(sessionId);
        for (const tracked of this.bySession.get(sessionId) ?? []) {
            if (tracked.turn !== turn || turn === undefined)
                continue;
            const state = event.type === 'approval/asked' ? 'waiting_approval' : 'running';
            this.enqueue(tracked.execution.id, async () => {
                tracked.execution = await this.dependencies.store.updateExecution(tracked.execution.id, value => ({ ...value, state }));
            });
        }
    }
    async fail(execution, failureCode) {
        await this.finish(execution, 'failed', failureCode);
    }
    async flush() {
        await Promise.allSettled([...this.tails.values()]);
        if (this.failure !== undefined) {
            const failure = this.failure;
            this.failure = undefined;
            throw failure;
        }
    }
    dispose() {
        this.byRequest.clear();
        this.bySession.clear();
        this.openTurn.clear();
    }
    queueTerminal(tracked, reason) {
        const kind = reason['kind'];
        if (kind === 'completed') {
            this.enqueue(tracked.execution.id, () => this.finish(tracked.execution, 'succeeded'));
        }
        else if (kind === 'aborted' || kind === 'interrupted') {
            this.enqueue(tracked.execution.id, () => this.finish(tracked.execution, 'cancelled'));
        }
        else {
            this.enqueue(tracked.execution.id, () => this.finish(tracked.execution, 'failed', 'internal_error'));
        }
    }
    async finish(execution, state, failureCode) {
        await this.dependencies.store.finishExecution(execution.id, state, {
            ...(failureCode === undefined ? {} : { failureCode }),
            finishedAt: this.now().toISOString(),
        });
        this.untrack(execution);
        await this.dependencies.executionFinished(execution.cronId, execution.id);
    }
    untrack(execution) {
        if (execution.sessionRequestId !== undefined)
            this.byRequest.delete(execution.sessionRequestId);
        if (execution.sessionId === undefined)
            return;
        const session = this.bySession.get(execution.sessionId);
        const tracked = [...(session ?? [])].find(value => value.execution.id === execution.id);
        if (tracked !== undefined)
            session?.delete(tracked);
        if (session?.size === 0)
            this.bySession.delete(execution.sessionId);
    }
    enqueue(id, operation) {
        const prior = this.tails.get(id) ?? Promise.resolve();
        const result = prior.then(operation, operation);
        this.tails.set(id, result);
        void result.catch((error) => { this.failure ??= error; });
        const cleanup = () => {
            if (this.tails.get(id) === result)
                this.tails.delete(id);
        };
        void result.then(cleanup, cleanup);
    }
}
function objectField(value, key) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const field = value[key];
    return typeof field === 'object' && field !== null ? field : undefined;
}
function numberField(value, key) {
    if (typeof value !== 'object' || value === null)
        return undefined;
    const field = value[key];
    return typeof field === 'number' ? field : undefined;
}
function rpcIdOf(value) {
    const source = objectField(value, 'source');
    return source?.['kind'] === 'user' && typeof source['rpcId'] === 'string'
        ? source['rpcId']
        : undefined;
}
