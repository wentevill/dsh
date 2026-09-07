import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { describe, expect, it, vi } from 'vitest'
import { CronExecutionId, CronId } from '../src/brand.ts'
import { requestIdForExecution } from '../src/execution.ts'
import { CronExecutionTracker } from '../src/tracker.ts'
import type { CronExecution } from '../src/types.ts'

const EXECUTION = CronExecutionId('execution-1')
const SESSION = 'session-1' as SessionId
const REQUEST = requestIdForExecution(EXECUTION)

function running(): CronExecution {
  return {
    id: EXECUTION, cronId: CronId('cron-1'), trigger: 'on_time', delayed: false,
    state: 'running', sessionId: SESSION, sessionRequestId: REQUEST,
  }
}

function event(type: string, data: unknown, seq = 1) {
  return { type, data, seq, time: seq }
}

function harness() {
  let value = running()
  const store = {
    updateExecution: vi.fn(async (
      _id: CronExecutionId,
      change: (execution: CronExecution) => CronExecution,
    ) => { value = change(value); return value }),
    finishExecution: vi.fn(async (
      _id: CronExecutionId,
      state: 'succeeded' | 'failed' | 'cancelled' | 'coalesced',
      patch: Partial<CronExecution> & { finishedAt: string },
    ) => { value = { ...value, ...patch, state }; return value }),
  }
  const executionFinished = vi.fn(async () => {})
  const tracker = new CronExecutionTracker({
    store, executionFinished,
    now: () => new Date('2026-09-07T02:00:00.000Z'),
  })
  tracker.track(value)
  return { executionFinished, store, tracker }
}

function accept(tracker: CronExecutionTracker, turn = 3) {
  tracker.observe(SESSION, event('turn/start', { turn }, 1))
  tracker.observe(SESSION, event('user/message', {
    id: 'message', role: 'user', content: [], source: { kind: 'user', rpcId: REQUEST },
  }, 2))
}

describe('CronExecutionTracker', () => {
  it('tracks approval waiting and continuation only inside the correlated turn', async () => {
    const { store, tracker } = harness()
    accept(tracker)
    tracker.observe(SESSION, event('approval/asked', { id: 'approval-1', toolName: 'bash' }, 3))
    await vi.waitFor(() => {
      expect(store.updateExecution).toHaveBeenLastCalledWith(EXECUTION, expect.any(Function))
    })
    expect(await store.updateExecution.mock.results.at(-1)!.value).toMatchObject({ state: 'waiting_approval' })

    tracker.observe(SESSION, event('approval/decided', {
      id: 'approval-1', outcome: 'allowed-once',
    }, 4))
    await vi.waitFor(async () => {
      expect(await store.updateExecution.mock.results.at(-1)!.value).toMatchObject({ state: 'running' })
    })
  })

  it.each([
    [{ kind: 'completed' }, 'succeeded', undefined],
    [{ kind: 'aborted', reason: { kind: 'user' } }, 'cancelled', undefined],
    [{ kind: 'interrupted' }, 'cancelled', undefined],
    [{ kind: 'error', error: { message: 'secret', code: 'UNKNOWN' } }, 'failed', 'internal_error'],
    [{ kind: 'blocked' }, 'failed', 'internal_error'],
  ] as const)('maps terminal reason %j to %s', async (reason, state, failureCode) => {
    const { executionFinished, store, tracker } = harness()
    accept(tracker)
    tracker.observe(SESSION, event('turn/end', { turn: 3, reason }, 5))

    await vi.waitFor(() => { expect(store.finishExecution).toHaveBeenCalledOnce() })
    expect(store.finishExecution).toHaveBeenCalledWith(EXECUTION, state, {
      ...(failureCode === undefined ? {} : { failureCode }),
      finishedAt: '2026-09-07T02:00:00.000Z',
    })
    expect(executionFinished).toHaveBeenCalledWith(CronId('cron-1'), EXECUTION)
  })

  it('ignores approval and terminal events outside the matched turn', async () => {
    const { store, tracker } = harness()
    accept(tracker, 3)
    tracker.observe(SESSION, event('turn/end', { turn: 2, reason: { kind: 'completed' } }, 3))
    tracker.observe(SESSION, event('turn/start', { turn: 4 }, 4))
    tracker.observe(SESSION, event('approval/asked', { id: 'other', toolName: 'bash' }, 5))
    tracker.observe(SESSION, event('turn/end', { turn: 4, reason: { kind: 'completed' } }, 6))

    await Promise.resolve()
    expect(store.updateExecution).not.toHaveBeenCalled()
    expect(store.finishExecution).not.toHaveBeenCalled()
  })
})
