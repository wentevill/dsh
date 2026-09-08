import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CronExecutionId, CronId } from './brand.ts'
import type { CronExecution, CronFailureCode } from './types.ts'

interface TrackerStorePort {
  updateExecution(
    id: CronExecutionId,
    change: (execution: CronExecution) => CronExecution,
  ): Promise<CronExecution>
  finishExecution(
    id: CronExecutionId,
    state: 'succeeded' | 'failed' | 'cancelled' | 'coalesced',
    patch: { readonly failureCode?: CronFailureCode; readonly finishedAt: string },
  ): Promise<CronExecution>
}

interface TrackerDependencies {
  readonly store: TrackerStorePort
  readonly executionFinished: (cronId: CronId, executionId: CronExecutionId) => Promise<void>
  readonly now?: () => Date
}

export interface CronObservedEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
}

interface TrackedExecution {
  execution: CronExecution
  turn?: number
}

/** Correlates Session journal events to durable Cron executions. */
export class CronExecutionTracker {
  private readonly byRequest = new Map<string, TrackedExecution>()
  private readonly bySession = new Map<SessionId, Set<TrackedExecution>>()
  private readonly openTurn = new Map<SessionId, number>()
  private readonly tails = new Map<CronExecutionId, Promise<void>>()
  private readonly now: () => Date
  private failure: unknown

  constructor(private readonly dependencies: TrackerDependencies) {
    this.now = dependencies.now ?? (() => new Date())
  }

  track(execution: CronExecution): void {
    if (execution.sessionId === undefined || execution.sessionRequestId === undefined) return
    const tracked: TrackedExecution = { execution }
    this.byRequest.set(execution.sessionRequestId, tracked)
    const session = this.bySession.get(execution.sessionId) ?? new Set()
    session.add(tracked)
    this.bySession.set(execution.sessionId, session)
  }

  observe(session: SessionId | { readonly id: SessionId }, event: CronObservedEvent): void {
    const sessionId = typeof session === 'string' ? session as SessionId : session.id
    if (event.type === 'turn/start') {
      const turn = numberField(event.data, 'turn')
      if (turn !== undefined) this.openTurn.set(sessionId, turn)
      return
    }
    if (event.type === 'user/message') {
      const requestId = rpcIdOf(event.data)
      const tracked = requestId === undefined ? undefined : this.byRequest.get(requestId)
      const turn = this.openTurn.get(sessionId)
      if (tracked !== undefined && tracked.execution.sessionId === sessionId && turn !== undefined) {
        tracked.turn = turn
      }
      return
    }
    if (event.type === 'turn/end') {
      const turn = numberField(event.data, 'turn')
      const reason = objectField(event.data, 'reason')
      if (turn !== undefined && reason !== undefined) {
        for (const tracked of this.bySession.get(sessionId) ?? []) {
          if (tracked.turn === turn) this.queueTerminal(tracked, reason)
        }
      }
      if (this.openTurn.get(sessionId) === turn) this.openTurn.delete(sessionId)
      return
    }
    if (event.type !== 'approval/asked' && event.type !== 'approval/decided') return
    const turn = this.openTurn.get(sessionId)
    for (const tracked of this.bySession.get(sessionId) ?? []) {
      if (tracked.turn !== turn || turn === undefined) continue
      const state = event.type === 'approval/asked' ? 'waiting_approval' : 'running'
      this.enqueue(tracked.execution.id, async () => {
        tracked.execution = await this.dependencies.store.updateExecution(
          tracked.execution.id,
          value => ({ ...value, state }),
        )
      })
    }
  }

  async fail(execution: CronExecution, failureCode: CronFailureCode): Promise<void> {
    await this.finish(execution, 'failed', failureCode)
  }

  async flush(): Promise<void> {
    await Promise.allSettled([...this.tails.values()])
    if (this.failure !== undefined) {
      const failure = this.failure
      this.failure = undefined
      throw failure
    }
  }

  dispose(): void {
    this.byRequest.clear()
    this.bySession.clear()
    this.openTurn.clear()
  }

  private queueTerminal(tracked: TrackedExecution, reason: Record<string, unknown>): void {
    const kind = reason['kind']
    if (kind === 'completed') {
      this.enqueue(tracked.execution.id, () => this.finish(tracked.execution, 'succeeded'))
    } else if (kind === 'aborted' || kind === 'interrupted') {
      this.enqueue(tracked.execution.id, () => this.finish(tracked.execution, 'cancelled'))
    } else {
      this.enqueue(tracked.execution.id, () => this.finish(tracked.execution, 'failed', 'internal_error'))
    }
  }

  private async finish(
    execution: CronExecution,
    state: 'succeeded' | 'failed' | 'cancelled',
    failureCode?: CronFailureCode,
  ): Promise<void> {
    await this.dependencies.store.finishExecution(execution.id, state, {
      ...(failureCode === undefined ? {} : { failureCode }),
      finishedAt: this.now().toISOString(),
    })
    this.untrack(execution)
    await this.dependencies.executionFinished(execution.cronId, execution.id)
  }

  private untrack(execution: CronExecution): void {
    if (execution.sessionRequestId !== undefined) this.byRequest.delete(execution.sessionRequestId)
    if (execution.sessionId === undefined) return
    const session = this.bySession.get(execution.sessionId)
    const tracked = [...(session ?? [])].find(value => value.execution.id === execution.id)
    if (tracked !== undefined) session?.delete(tracked)
    if (session?.size === 0) this.bySession.delete(execution.sessionId)
  }

  private enqueue(id: CronExecutionId, operation: () => Promise<void>): void {
    const prior = this.tails.get(id) ?? Promise.resolve()
    const result = prior.then(operation, operation)
    this.tails.set(id, result)
    void result.catch((error: unknown) => { this.failure ??= error })
    const cleanup = () => {
      if (this.tails.get(id) === result) this.tails.delete(id)
    }
    void result.then(cleanup, cleanup)
  }
}

function objectField(value: unknown, key: string): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'object' && field !== null ? field as Record<string, unknown> : undefined
}

function numberField(value: unknown, key: string): number | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'number' ? field : undefined
}

function rpcIdOf(value: unknown): string | undefined {
  const source = objectField(value, 'source')
  return source?.['kind'] === 'user' && typeof source['rpcId'] === 'string'
    ? source['rpcId']
    : undefined
}
