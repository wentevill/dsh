import type { CronExecutionId } from './brand.ts'
import type {
  CronDefinitionState,
  CronOccurrence,
  CronRuntimeState,
} from './types.ts'

export interface CronMachineState {
  readonly definitionState: CronDefinitionState
  readonly runtime: CronRuntimeState
}

export type CronMachineEvent =
  | {
    readonly kind: 'fire'
    readonly occurrence: CronOccurrence
    readonly executionId: CronExecutionId
  }
  | {
    readonly kind: 'execution_finished'
    readonly executionId: CronExecutionId
    readonly nextExecutionId: CronExecutionId
    readonly observedAt: string
  }
  | { readonly kind: 'approval_waiting'; readonly executionId: CronExecutionId }
  | { readonly kind: 'pause' }
  | { readonly kind: 'resume' }
  | { readonly kind: 'delete' }

export type CronMachineEffect =
  | {
    readonly kind: 'begin'
    readonly executionId: CronExecutionId
    readonly occurrence: CronOccurrence
  }
  | { readonly kind: 'coalesce'; readonly occurrence: CronOccurrence }
  | { readonly kind: 'start_timer' }
  | { readonly kind: 'stop_timer' }
  | { readonly kind: 'destroy_timer' }

export interface CronMachineTransition {
  readonly next: CronMachineState
  readonly effects: readonly CronMachineEffect[]
}

/** Pure single-flight transition function. */
export function reduceCronRuntime(
  state: CronMachineState,
  event: CronMachineEvent,
): CronMachineTransition {
  switch (event.kind) {
    case 'fire':
      return fire(state, event)
    case 'execution_finished':
      return finish(state, event)
    case 'approval_waiting':
      return { next: state, effects: [] }
    case 'pause':
      return suspend(state, 'paused', 'stop_timer')
    case 'delete':
      return suspend(state, 'deleted', 'destroy_timer')
    case 'resume':
      return {
        next: { ...state, definitionState: 'active' },
        effects: [{ kind: 'start_timer' }],
      }
    default:
      return assertNever(event)
  }
}

function fire(
  state: CronMachineState,
  event: Extract<CronMachineEvent, { readonly kind: 'fire' }>,
): CronMachineTransition {
  if (state.definitionState !== 'active') {
    return { next: state, effects: [{ kind: 'coalesce', occurrence: event.occurrence }] }
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
    }
  }
  const effects: CronMachineEffect[] = []
  if (state.runtime.pendingOccurrence !== undefined) {
    effects.push({ kind: 'coalesce', occurrence: state.runtime.pendingOccurrence })
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
  }
}

function finish(
  state: CronMachineState,
  event: Extract<CronMachineEvent, { readonly kind: 'execution_finished' }>,
): CronMachineTransition {
  if (state.runtime.activeExecutionId !== event.executionId) {
    return { next: state, effects: [] }
  }
  const pending = state.runtime.pendingOccurrence
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
    }
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
    }
  }
  const delayed: CronOccurrence = {
    ...pending,
    trigger: 'pending_after_run',
    delayed: true,
  }
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
  }
}

function suspend(
  state: CronMachineState,
  definitionState: Extract<CronDefinitionState, 'paused' | 'deleted'>,
  timer: Extract<CronMachineEffect['kind'], 'stop_timer' | 'destroy_timer'>,
): CronMachineTransition {
  const effects: CronMachineEffect[] = [{ kind: timer }]
  if (state.runtime.pendingOccurrence !== undefined) {
    effects.push({ kind: 'coalesce', occurrence: state.runtime.pendingOccurrence })
  }
  return {
    next: {
      definitionState,
      runtime: { ...state.runtime, pendingOccurrence: undefined },
    },
    effects,
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled Cron runtime event: ${String(value)}`)
}
