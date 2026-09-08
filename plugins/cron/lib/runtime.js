import { CronExecutionId as makeCronExecutionId } from "./brand.js";
import { reduceCronRuntime } from "./state-machine.js";
/** Owns live node-cron tasks and durable single-flight orchestration. */
export class CronRuntime {
    dependencies;
    definitions = new Map();
    states = new Map();
    live = new Map();
    tails = new Map();
    createExecutionId;
    now;
    disposed = false;
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.createExecutionId = dependencies.createExecutionId
            ?? (() => makeCronExecutionId(crypto.randomUUID()));
        this.now = dependencies.now ?? (() => new Date());
    }
    async initialize() {
        const recovery = this.dependencies.store.recover();
        const runtimeById = new Map(recovery.runtime.map(value => [value.cronId, value]));
        for (const definition of recovery.activeDefinitions) {
            this.definitions.set(definition.id, definition);
            const observedAt = this.now().toISOString();
            const persisted = runtimeById.get(definition.id) ?? { cronId: definition.id, observedAt };
            const recoveredExecution = recovery.nonterminalExecutions.find(value => value.cronId === definition.id);
            const oldRuntime = persisted.activeExecutionId === undefined && recoveredExecution !== undefined
                ? { ...persisted, activeExecutionId: recoveredExecution.id }
                : persisted;
            this.states.set(definition.id, { definitionState: 'active', runtime: oldRuntime });
            let live;
            try {
                live = await this.register(definition);
            }
            catch {
                try {
                    this.dependencies.registrationFailed?.(definition);
                }
                catch { }
                continue;
            }
            const checkpointed = withCheckpoint(oldRuntime, live.nextRunAt(), observedAt);
            this.states.set(definition.id, { definitionState: 'active', runtime: checkpointed });
            await this.dependencies.store.putRuntime(compactRuntime(checkpointed));
            if (isOverdue(oldRuntime, observedAt)) {
                await this.enqueue(definition.id, () => this.fire(definition.id, {
                    trigger: 'startup_catch_up',
                    scheduledFor: oldRuntime.libraryNextRunAt,
                    observedAt,
                    delayed: true,
                    coalescedThrough: observedAt,
                }));
            }
        }
    }
    changed(previous, next, options) {
        return this.definitionChanged(previous, next, options);
    }
    definitionChanged(previous, next, options) {
        return this.enqueue(next.id, () => this.applyDefinitionChange(previous, next, options));
    }
    executionFinished(cronId, executionId) {
        return this.enqueue(cronId, async () => {
            const state = this.states.get(cronId);
            const definition = this.definitions.get(cronId);
            if (state === undefined || definition === undefined)
                return;
            const transition = reduceCronRuntime(state, {
                kind: 'execution_finished', executionId,
                nextExecutionId: this.createExecutionId(), observedAt: this.now().toISOString(),
            });
            this.states.set(cronId, transition.next);
            await this.applyOccurrenceEffects(definition, transition.next.runtime, transition.effects);
        });
    }
    async dispose() {
        this.disposed = true;
        const failures = [];
        const destroyed = await Promise.allSettled([...this.live.values()].map(task => task.destroy()));
        for (const result of destroyed) {
            if (result.status === 'rejected')
                failures.push(result.reason);
        }
        this.live.clear();
        const drained = await Promise.allSettled([...this.tails.values()]);
        for (const result of drained) {
            if (result.status === 'rejected')
                failures.push(result.reason);
        }
        if (failures.length > 0)
            throw new Error('Cron runtime disposal failed');
    }
    async applyDefinitionChange(previous, next, options) {
        this.definitions.set(next.id, next);
        const current = this.states.get(next.id) ?? {
            definitionState: previous?.state ?? next.state,
            runtime: { cronId: next.id, observedAt: this.now().toISOString() },
        };
        if (next.state === 'active') {
            await this.live.get(next.id)?.destroy();
            this.live.delete(next.id);
            const runtime = options.clearPending
                ? { ...current.runtime, pendingOccurrence: undefined }
                : current.runtime;
            const live = await this.register(next);
            const checkpointed = withCheckpoint(runtime, live.nextRunAt(), this.now().toISOString());
            this.states.set(next.id, { definitionState: 'active', runtime: checkpointed });
            await this.dependencies.store.putRuntime(compactRuntime(checkpointed));
            return;
        }
        const event = next.state === 'paused' ? { kind: 'pause' } : { kind: 'delete' };
        const transition = reduceCronRuntime(current, event);
        this.states.set(next.id, transition.next);
        await this.applyControlEffects(next, transition.effects);
        await this.dependencies.store.putRuntime(compactRuntime(transition.next.runtime));
    }
    async register(definition) {
        const live = await this.dependencies.library.start(definition, scheduledFor => this.enqueue(definition.id, () => this.fire(definition.id, {
            trigger: 'on_time', scheduledFor: scheduledFor.toISOString(),
            observedAt: this.now().toISOString(), delayed: false,
        })));
        this.live.set(definition.id, live);
        return live;
    }
    async fire(cronId, occurrence) {
        if (this.disposed)
            return;
        const state = this.states.get(cronId);
        const definition = this.definitions.get(cronId);
        if (state === undefined || definition === undefined)
            return;
        const transition = reduceCronRuntime(state, {
            kind: 'fire', occurrence, executionId: this.createExecutionId(),
        });
        const runtime = withCheckpoint(transition.next.runtime, this.live.get(cronId)?.nextRunAt(), occurrence.observedAt);
        this.states.set(cronId, { ...transition.next, runtime });
        await this.applyOccurrenceEffects(definition, runtime, transition.effects);
    }
    async applyOccurrenceEffects(definition, runtime, effects) {
        const dispatch = [];
        for (const effect of effects) {
            if (effect.kind === 'begin') {
                const execution = executionFor(definition.id, effect.executionId, effect.occurrence, 'queued');
                await this.dependencies.store.beginExecution(execution);
                dispatch.push(execution);
            }
            else if (effect.kind === 'coalesce') {
                await this.dependencies.store.beginExecution(executionFor(definition.id, this.createExecutionId(), effect.occurrence, 'coalesced', this.now().toISOString()));
            }
        }
        await this.dependencies.store.putRuntime(compactRuntime(runtime));
        for (const execution of dispatch) {
            await this.dependencies.dispatch(execution, definition);
        }
    }
    async applyControlEffects(definition, effects) {
        for (const effect of effects) {
            if (effect.kind === 'stop_timer')
                await this.live.get(definition.id)?.stop();
            if (effect.kind === 'destroy_timer') {
                await this.live.get(definition.id)?.destroy();
                this.live.delete(definition.id);
            }
            if (effect.kind === 'coalesce') {
                await this.dependencies.store.beginExecution(executionFor(definition.id, this.createExecutionId(), effect.occurrence, 'coalesced', this.now().toISOString()));
            }
        }
    }
    enqueue(id, operation) {
        const prior = this.tails.get(id) ?? Promise.resolve();
        const result = prior.then(operation, operation);
        const tail = result.then(() => { }, () => { });
        this.tails.set(id, tail);
        void tail.then(() => {
            if (this.tails.get(id) === tail)
                this.tails.delete(id);
        });
        return result;
    }
}
function executionFor(cronId, id, occurrence, state, finishedAt) {
    return {
        id, cronId, trigger: occurrence.trigger, scheduledFor: occurrence.scheduledFor,
        delayed: occurrence.delayed,
        ...(occurrence.coalescedThrough === undefined ? {} : { coalescedThrough: occurrence.coalescedThrough }),
        state,
        ...(finishedAt === undefined ? {} : { finishedAt }),
    };
}
function isOverdue(runtime, observedAt) {
    return runtime.libraryNextRunAt !== undefined
        && runtime.libraryNextRunAt > runtime.observedAt
        && runtime.libraryNextRunAt <= observedAt;
}
function withCheckpoint(runtime, nextRun, observedAt) {
    return {
        ...runtime,
        observedAt,
        ...(nextRun === undefined ? {} : { libraryNextRunAt: nextRun.toISOString() }),
    };
}
function compactRuntime(runtime) {
    return Object.fromEntries(Object.entries(runtime).filter(([, value]) => value !== undefined));
}
