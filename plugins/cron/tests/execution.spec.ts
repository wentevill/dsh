import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Workspace, WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { describe, expect, it, vi } from 'vitest'
import { CronExecutionId, CronId } from '../src/brand.ts'
import {
  CronExecutionService,
  requestIdForExecution,
  sessionIdForExecution,
} from '../src/execution.ts'
import { CronExecutionTracker } from '../src/tracker.ts'
import type { CronDefinition, CronExecution } from '../src/types.ts'

const EXECUTION = CronExecutionId('execution-1')
const TARGET = 'session-target' as SessionId
const WORKSPACE = 'workspace-1' as WorkspaceId

function workspace(sessionIds: readonly SessionId[]): Workspace {
  return {
    id: WORKSPACE, path: '/workspace', title: 'Workspace', sessionIds,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    setTitle: async () => {}, attachSession: async () => {}, insertSessionBefore: async () => {},
    detachSession: async () => {}, status: async () => 'ok',
  }
}

function definition(mode: 'existing_session' | 'new_session' = 'existing_session'): CronDefinition {
  const base = {
    id: CronId('cron-1'), workspaceId: WORKSPACE, name: '日报', expression: '0 9 * * *',
    timezone: 'Asia/Shanghai', prompt: '生成日报', createdFromSessionId: 'creator' as SessionId,
    state: 'active' as const, revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
  return mode === 'existing_session'
    ? { ...base, executionMode: mode, targetSessionId: TARGET }
    : { ...base, executionMode: mode, agentPresetId: 'captured-preset' as never }
}

function queued(): CronExecution {
  return {
    id: EXECUTION, cronId: CronId('cron-1'), trigger: 'on_time',
    scheduledFor: '2026-09-07T01:00:00.000Z', delayed: false, state: 'queued',
  }
}

class ExecutionStore {
  value = queued()
  readonly order: string[] = []
  readonly finishExecution = vi.fn(async (
    _id: CronExecutionId,
    state: 'succeeded' | 'failed' | 'cancelled' | 'coalesced',
    patch: Partial<CronExecution> & { finishedAt: string },
  ) => {
    this.value = { ...this.value, ...patch, state }
    this.order.push(`finish:${state}`)
    return this.value
  })
  readonly updateExecution = vi.fn(async (
    _id: CronExecutionId,
    change: (value: CronExecution) => CronExecution,
  ) => {
    this.value = change(this.value)
    this.order.push('persist')
    return this.value
  })
}

function harness(options?: { members?: readonly SessionId[]; inspectEvents?: readonly unknown[] }) {
  const store = new ExecutionStore()
  const targetSession = { id: TARGET, events: [{ type: 'permission/preset', data: { preset: 'danger-full-access' } }] }
  const freshSession = { id: sessionIdForExecution(EXECUTION), events: [] }
  const targetAgent = { ctx: new Context(), session: targetSession }
  const freshAgent = { ctx: new Context(), session: freshSession }
  const order = store.order
  const sessionController = {
    create: vi.fn(async (_request: unknown) => { order.push('create'); return { sessionId: freshSession.id } }),
    resolveAgent: vi.fn(async (id: SessionId) => {
      order.push(`resolve:${id}`)
      return { agent: id === freshSession.id ? freshAgent : targetAgent }
    }),
    prompt: vi.fn(async () => { order.push('prompt'); return { accepted: true as const } }),
    inspect: vi.fn(async () => ({ meta: { id: TARGET }, events: options?.inspectEvents ?? [] })),
  }
  const permissionPresets = {
    resolve: vi.fn(() => ({ sandbox: 'workspace-write', approval: 'ask' })),
    set: vi.fn(() => { order.push('permission') }),
  }
  const tracker = new CronExecutionTracker({
    store,
    executionFinished: vi.fn(async () => {}),
    now: () => new Date('2026-09-07T02:00:00.000Z'),
  })
  const service = new CronExecutionService({
    store, sessionController, permissionPresets, tracker,
    workspaceRegistry: {
      get: () => workspace(options?.members ?? [TARGET]),
    },
    now: () => new Date('2026-09-07T01:00:01.000Z'),
  })
  return { permissionPresets, service, sessionController, store, targetAgent, freshAgent }
}

describe('CronExecutionService', () => {
  it('uses the exact fixed target with a stable queued request after durable correlation', async () => {
    const { service, sessionController, store } = harness()
    await service.dispatch(queued(), definition())

    expect(store.value).toMatchObject({
      sessionId: TARGET,
      sessionRequestId: requestIdForExecution(EXECUTION),
      state: 'running',
    })
    expect(store.order).toEqual(['persist', `resolve:${TARGET}`, 'prompt'])
    expect(sessionController.prompt).toHaveBeenCalledWith({
      sessionId: TARGET,
      requestId: requestIdForExecution(EXECUTION),
      mode: 'queue',
      content: [{ type: 'text', text: '生成日报' }],
    }, expect.any(AbortSignal))
    expect(requestIdForExecution(EXECUTION)).toMatch(/^cron-request-v1-/u)
  })

  it('fails only the execution when its fixed target leaves the Workspace', async () => {
    const { service, sessionController, store } = harness({ members: [] })
    await service.dispatch(queued(), definition())

    expect(store.finishExecution).toHaveBeenCalledWith(EXECUTION, 'failed', expect.objectContaining({
      failureCode: 'target_session_unavailable',
    }))
    expect(sessionController.resolveAgent).not.toHaveBeenCalled()
    expect(sessionController.prompt).not.toHaveBeenCalled()
  })

  it('creates a deterministic fresh Session and pins workspace-write before prompt admission', async () => {
    const { permissionPresets, service, sessionController, store, freshAgent } = harness()
    const fresh = definition('new_session')
    await service.dispatch(queued(), fresh)

    const expectedSessionId = sessionIdForExecution(EXECUTION)
    expect(sessionController.create).toHaveBeenCalledWith({
      sessionId: expectedSessionId,
      workspaceId: WORKSPACE,
      agentPreset: 'captured-preset',
    })
    expect(permissionPresets.resolve).toHaveBeenCalledWith('workspace-write')
    expect(permissionPresets.set).toHaveBeenCalledWith(freshAgent.session, 'workspace-write')
    expect(store.order).toEqual([
      'persist', 'create', `resolve:${expectedSessionId}`, 'permission', 'prompt',
    ])
    expect(sessionController.create.mock.calls[0]![0]).not.toHaveProperty('permissionPreset')
  })

  it('adopts a durable matching rpcId during recovery without prompting again', async () => {
    const requestId = requestIdForExecution(EXECUTION)
    const accepted = {
      type: 'user/message', seq: 2, time: 2,
      data: { source: { kind: 'user', rpcId: requestId }, role: 'user', content: [], id: 'message' },
    }
    const { service, sessionController, store } = harness({ inspectEvents: [
      { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } }, accepted,
    ] })
    store.value = { ...queued(), sessionId: TARGET, sessionRequestId: requestId, state: 'running' }

    await service.recover(store.value, definition())

    expect(sessionController.inspect).toHaveBeenCalledWith(TARGET)
    expect(sessionController.prompt).not.toHaveBeenCalled()
  })

  it('resubmits the same durable identity when recovery inspection has no matching rpcId', async () => {
    const requestId = requestIdForExecution(EXECUTION)
    const { service, sessionController, store } = harness({ inspectEvents: [] })
    store.value = { ...queued(), sessionId: TARGET, sessionRequestId: requestId, state: 'running' }

    await service.recover(store.value, definition())

    expect(sessionController.prompt).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: TARGET, requestId,
    }), expect.any(AbortSignal))
  })
})
