import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { describe, expect, it, vi } from 'vitest'
import { CronExecutionId, CronId } from '../src/brand.ts'
import { CronRuntime } from '../src/runtime.ts'
import type { LiveCron } from '../src/node-cron-runtime.ts'
import type {
  CronDefinition,
  CronExecution,
  CronRuntimeState,
} from '../src/types.ts'

const at = (hour: number) => `2026-09-07T${String(hour).padStart(2, '0')}:00:00.000Z`

function definition(id: string, state: CronDefinition['state'] = 'active'): CronDefinition {
  return {
    id: CronId(id), workspaceId: 'workspace-1' as WorkspaceId, name: id,
    expression: '0 * * * *', timezone: 'UTC', prompt: 'run',
    executionMode: 'existing_session', createdFromSessionId: 'session-1' as SessionId,
    targetSessionId: 'session-1' as SessionId, state, revision: 1,
    createdAt: at(0), updatedAt: at(0),
    ...(state === 'deleted' ? { deletedAt: at(1) } : {}),
  }
}

class FakeLibrary {
  readonly callbacks = new Map<string, (scheduledFor: Date) => Promise<void>>()
  readonly live = new Map<string, LiveCron & { destroy: ReturnType<typeof vi.fn> }>()
  readonly failures = new Set<string>()
  readonly destroyFailures = new Set<string>()
  readonly destroyWaits = new Map<string, Promise<void>>()

  async start(value: CronDefinition, callback: (scheduledFor: Date) => Promise<void>): Promise<LiveCron> {
    if (this.failures.has(value.id)) {
      throw new Error(`unsafe registration detail: ${value.id}`)
    }
    this.callbacks.set(value.id, callback)
    const task = {
      start: vi.fn(async () => {}), stop: vi.fn(async () => {}), destroy: vi.fn(async () => {
        await this.destroyWaits.get(value.id)
        if (this.destroyFailures.has(value.id)) throw new Error(`unsafe destroy detail: ${value.id}`)
      }),
      nextRunAt: () => new Date(at(11)),
    }
    this.live.set(value.id, task)
    await task.start()
    return task
  }
}

class FakeStore {
  recovery = {
    activeDefinitions: [] as CronDefinition[], runtime: [] as CronRuntimeState[],
    nonterminalExecutions: [] as CronExecution[], orphanRuntime: [], orphanExecutions: [],
  }
  readonly order: string[] = []
  readonly executions: CronExecution[] = []
  readonly runtime: CronRuntimeState[] = []

  recover() { this.order.push('recover'); return this.recovery }
  async beginExecution(value: CronExecution) {
    this.order.push(`begin:${value.id}`); this.executions.push(value); return value
  }
  async putRuntime(value: CronRuntimeState) {
    this.order.push(`runtime:${value.cronId}`); this.runtime.push(value); return value
  }
}

function harness(store = new FakeStore(), library = new FakeLibrary()) {
  let id = 0
  const dispatch = vi.fn(async (execution: CronExecution) => { store.order.push(`dispatch:${execution.id}`) })
  const registrationFailed = vi.fn()
  const runtime = new CronRuntime({
    store, library, dispatch,
    registrationFailed,
    createExecutionId: () => CronExecutionId(`execution-${++id}`),
    now: () => new Date(at(10)),
  })
  return { dispatch, library, registrationFailed, runtime, store }
}

describe('CronRuntime', () => {
  it('registers only active definitions and destroys every live task on dispose', async () => {
    const { library, runtime } = harness()
    await runtime.definitionChanged(undefined, definition('active'), { clearPending: false })
    await runtime.definitionChanged(undefined, definition('paused', 'paused'), { clearPending: false })
    await runtime.definitionChanged(undefined, definition('deleted', 'deleted'), { clearPending: true })

    expect([...library.callbacks.keys()]).toEqual(['active'])
    await runtime.dispose()
    expect(library.live.get('active')!.destroy).toHaveBeenCalledOnce()
  })

  it('isolates one stored definition registration failure and continues loading', async () => {
    const { library, registrationFailed, runtime, store } = harness()
    const broken = definition('broken')
    const healthy = definition('healthy')
    library.failures.add(broken.id)
    store.recovery = {
      ...store.recovery,
      activeDefinitions: [broken, healthy],
    }

    await runtime.initialize()

    expect(registrationFailed).toHaveBeenCalledWith(broken)
    expect(library.callbacks.has(healthy.id)).toBe(true)
    await runtime.dispose()
  })

  it('waits for every live task cleanup before reporting disposal failures', async () => {
    const { library, runtime } = harness()
    await runtime.definitionChanged(undefined, definition('broken'), { clearPending: false })
    await runtime.definitionChanged(undefined, definition('slow'), { clearPending: false })
    library.destroyFailures.add('broken')
    let releaseSlow!: () => void
    library.destroyWaits.set('slow', new Promise(resolve => { releaseSlow = resolve }))

    let settled = false
    const disposal = runtime.dispose()
    void disposal.then(() => { settled = true }, () => { settled = true })
    await vi.waitFor(() => expect(library.live.get('slow')!.destroy).toHaveBeenCalledOnce())
    await Promise.resolve()
    expect(settled).toBe(false)

    releaseSlow()
    const failure = await disposal.then(() => undefined, error => error)
    expect(failure).toMatchObject({ message: 'Cron runtime disposal failed' })
    expect(failure).not.toHaveProperty('errors')
  })

  it('coalesces an overdue durable checkpoint into one startup catch-up', async () => {
    const { dispatch, library, runtime, store } = harness()
    const active = definition('cron-1')
    store.recovery = {
      ...store.recovery,
      activeDefinitions: [active],
      runtime: [{ cronId: active.id, libraryNextRunAt: at(8), observedAt: at(7) }],
    }

    await runtime.initialize()

    expect(library.callbacks.has(active.id)).toBe(true)
    expect(store.executions).toHaveLength(1)
    expect(store.executions[0]).toMatchObject({
      trigger: 'startup_catch_up', scheduledFor: at(8), delayed: true,
      coalescedThrough: at(10), state: 'queued',
    })
    expect(dispatch).toHaveBeenCalledOnce()
    expect(store.order.slice(0, 4)).toEqual([
      'recover', 'runtime:cron-1', 'begin:execution-1', 'runtime:cron-1',
    ])
    await runtime.dispose()
  })

  it('makes catch-up pending when a crash left a durable execution without its runtime pointer', async () => {
    const { dispatch, runtime, store } = harness()
    const active = definition('cron-1')
    const unfinished: CronExecution = {
      id: CronExecutionId('existing-execution'), cronId: active.id, trigger: 'on_time',
      scheduledFor: at(7), delayed: false, state: 'queued',
    }
    store.recovery = {
      ...store.recovery,
      activeDefinitions: [active],
      runtime: [{ cronId: active.id, libraryNextRunAt: at(8), observedAt: at(7) }],
      nonterminalExecutions: [unfinished],
    }

    await runtime.initialize()

    expect(store.executions).toEqual([])
    expect(dispatch).not.toHaveBeenCalled()
    expect(store.runtime.at(-1)).toMatchObject({
      activeExecutionId: unfinished.id,
      pendingOccurrence: {
        trigger: 'startup_catch_up', scheduledFor: at(8), coalescedThrough: at(10),
      },
    })
    await runtime.dispose()
  })

  it('persists an execution then the library checkpoint before live dispatch', async () => {
    const { library, runtime, store } = harness()
    const active = definition('cron-1')
    await runtime.definitionChanged(undefined, active, { clearPending: false })
    store.order.length = 0

    await library.callbacks.get(active.id)!(new Date(at(9)))

    expect(store.order).toEqual([
      'begin:execution-1', 'runtime:cron-1', 'dispatch:execution-1',
    ])
    expect(store.runtime.at(-1)).toMatchObject({ libraryNextRunAt: at(11) })
    await runtime.dispose()
  })

  it('does not let a blocked Cron delay an unrelated Cron', async () => {
    const store = new FakeStore()
    let release!: () => void
    const original = store.beginExecution.bind(store)
    store.beginExecution = async (value) => {
      if (value.cronId === 'cron-1') await new Promise<void>((resolve) => { release = resolve })
      return original(value)
    }
    const { dispatch, library, runtime } = harness(store)
    await runtime.definitionChanged(undefined, definition('cron-1'), { clearPending: false })
    await runtime.definitionChanged(undefined, definition('cron-2'), { clearPending: false })

    const first = library.callbacks.get('cron-1')!(new Date(at(9)))
    await vi.waitFor(() => { expect(release).toBeTypeOf('function') })
    await library.callbacks.get('cron-2')!(new Date(at(9)))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ cronId: 'cron-2' }), expect.anything())
    release()
    await first
    await runtime.dispose()
  })
})
