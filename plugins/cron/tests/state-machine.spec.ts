import { describe, expect, it } from 'vitest'
import { CronExecutionId, CronId } from '../src/brand.ts'
import { reduceCronRuntime } from '../src/state-machine.ts'
import type { CronMachineEvent, CronMachineState } from '../src/state-machine.ts'
import type { CronOccurrence } from '../src/types.ts'

const occurrence = (minute: string): CronOccurrence => ({
  trigger: 'on_time', scheduledFor: `2026-09-07T09:${minute}:00.000Z`,
  observedAt: `2026-09-07T09:${minute}:00.100Z`, delayed: false,
})

function state(options?: Partial<CronMachineState>): CronMachineState {
  return {
    definitionState: 'active',
    runtime: { cronId: CronId('cron-1'), observedAt: '2026-09-07T09:00:00.000Z' },
    ...options,
  }
}

const fire = (minute: string, id = `execution-${minute}`): CronMachineEvent => ({
  kind: 'fire', occurrence: occurrence(minute), executionId: CronExecutionId(id),
})

describe('reduceCronRuntime', () => {
  it('begins an idle occurrence as the active execution', () => {
    expect(reduceCronRuntime(state(), fire('00'))).toEqual({
      next: state({ runtime: {
        cronId: CronId('cron-1'), observedAt: occurrence('00').observedAt,
        activeExecutionId: CronExecutionId('execution-00'),
      } }),
      effects: [{
        kind: 'begin', executionId: CronExecutionId('execution-00'), occurrence: occurrence('00'),
      }],
    })
  })

  it('keeps one pending occurrence while an execution is active', () => {
    const active = state({ runtime: {
      cronId: CronId('cron-1'), observedAt: occurrence('00').observedAt,
      activeExecutionId: CronExecutionId('execution-00'),
    } })
    expect(reduceCronRuntime(active, fire('05'))).toEqual({
      next: state({ runtime: {
        ...active.runtime, observedAt: occurrence('05').observedAt,
        pendingOccurrence: occurrence('05'),
      } }),
      effects: [],
    })
  })

  it('replaces pending work and records the replaced occurrence as coalesced', () => {
    const pending = occurrence('05')
    const active = state({ runtime: {
      cronId: CronId('cron-1'), observedAt: pending.observedAt,
      activeExecutionId: CronExecutionId('execution-00'), pendingOccurrence: pending,
    } })
    expect(reduceCronRuntime(active, fire('10'))).toEqual({
      next: state({ runtime: {
        ...active.runtime, observedAt: occurrence('10').observedAt,
        pendingOccurrence: occurrence('10'),
      } }),
      effects: [{ kind: 'coalesce', occurrence: pending }],
    })
  })

  it('dispatches pending work immediately after active completion', () => {
    const pending = occurrence('05')
    const active = state({ runtime: {
      cronId: CronId('cron-1'), observedAt: pending.observedAt,
      activeExecutionId: CronExecutionId('execution-00'), pendingOccurrence: pending,
    } })
    expect(reduceCronRuntime(active, {
      kind: 'execution_finished', executionId: CronExecutionId('execution-00'),
      nextExecutionId: CronExecutionId('execution-05'), observedAt: occurrence('10').observedAt,
    })).toEqual({
      next: state({ runtime: {
        cronId: CronId('cron-1'), observedAt: occurrence('10').observedAt,
        activeExecutionId: CronExecutionId('execution-05'),
      } }),
      effects: [{
        kind: 'begin', executionId: CronExecutionId('execution-05'),
        occurrence: { ...pending, trigger: 'pending_after_run', delayed: true },
      }],
    })
  })

  it.each([
    ['pause', 'paused', 'stop_timer'],
    ['delete', 'deleted', 'destroy_timer'],
  ] as const)('%s clears pending but preserves an active approval-blocked run', (kind, definitionState, timer) => {
    const pending = occurrence('05')
    const active = state({ runtime: {
      cronId: CronId('cron-1'), observedAt: pending.observedAt,
      activeExecutionId: CronExecutionId('execution-00'), pendingOccurrence: pending,
    } })
    expect(reduceCronRuntime(active, { kind })).toEqual({
      next: state({
        definitionState,
        runtime: { ...active.runtime, pendingOccurrence: undefined },
      }),
      effects: [{ kind: timer }, { kind: 'coalesce', occurrence: pending }],
    })
  })

  it('does not release single-flight while approval is waiting', () => {
    const active = state({ runtime: {
      cronId: CronId('cron-1'), observedAt: occurrence('00').observedAt,
      activeExecutionId: CronExecutionId('execution-00'),
    } })
    expect(reduceCronRuntime(active, {
      kind: 'approval_waiting', executionId: CronExecutionId('execution-00'),
    })).toEqual({ next: active, effects: [] })
  })
})
