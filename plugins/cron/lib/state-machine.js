/** Pure single-flight transition function. */
export function reduceCronRuntime(state, event) {
    switch (event.kind) {
        case 'fire':
            return fire(state, event);
        case 'execution_finished':
            return finish(state, event);
        case 'approval_waiting':
            return { next: state, effects: [] };
        case 'pause':
            return suspend(state, 'paused', 'stop_timer');
        case 'delete':
            return suspend(state, 'deleted', 'destroy_timer');
        case 'resume':
            return {
                next: { ...state, definitionState: 'active' },
                effects: [{ kind: 'start_timer' }],
            };
        default:
            return assertNever(event);
    }
}
function fire(state, event) {
    if (state.definitionState !== 'active') {
        return { next: state, effects: [{ kind: 'coalesce', occurrence: event.occurrence }] };
    }
    if (state.runtime.activeExecutionId === undefined) {
        return {
            next: {
                ...state,
                runtime: {
                    ...state.runtime,
                    observedAt: event.occurrence.observedAt,
                    activeExecutionId: event.executionId,
                },
            },
            effects: [{ kind: 'begin', executionId: event.executionId, occurrence: event.occurrence }],
        };
    }
    const effects = [];
    if (state.runtime.pendingOccurrence !== undefined) {
        effects.push({ kind: 'coalesce', occurrence: state.runtime.pendingOccurrence });
    }
    return {
        next: {
            ...state,
            runtime: {
                ...state.runtime,
                observedAt: event.occurrence.observedAt,
                pendingOccurrence: event.occurrence,
            },
        },
        effects,
    };
}
function finish(state, event) {
    if (state.runtime.activeExecutionId !== event.executionId) {
        return { next: state, effects: [] };
    }
    const pending = state.runtime.pendingOccurrence;
    if (pending === undefined) {
        return {
            next: {
                ...state,
                runtime: {
                    ...state.runtime,
                    observedAt: event.observedAt,
                    activeExecutionId: undefined,
                },
            },
            effects: [],
        };
    }
    if (state.definitionState !== 'active') {
        return {
            next: {
                ...state,
                runtime: {
                    ...state.runtime,
                    observedAt: event.observedAt,
                    activeExecutionId: undefined,
                    pendingOccurrence: undefined,
                },
            },
            effects: [{ kind: 'coalesce', occurrence: pending }],
        };
    }
    const delayed = {
        ...pending,
        trigger: 'pending_after_run',
        delayed: true,
    };
    return {
        next: {
            ...state,
            runtime: {
                ...state.runtime,
                observedAt: event.observedAt,
                activeExecutionId: event.nextExecutionId,
                pendingOccurrence: undefined,
            },
        },
        effects: [{ kind: 'begin', executionId: event.nextExecutionId, occurrence: delayed }],
    };
}
function suspend(state, definitionState, timer) {
    const effects = [{ kind: timer }];
    if (state.runtime.pendingOccurrence !== undefined) {
        effects.push({ kind: 'coalesce', occurrence: state.runtime.pendingOccurrence });
    }
    return {
        next: {
            definitionState,
            runtime: { ...state.runtime, pendingOccurrence: undefined },
        },
        effects,
    };
}
function assertNever(value) {
    throw new Error(`unhandled Cron runtime event: ${String(value)}`);
}
