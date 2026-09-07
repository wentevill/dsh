import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { Workspace, WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { describe, expect, it, vi } from 'vitest'
import { CronExecutionId, CronId } from '../src/brand.ts'
import { CronCommandService } from '../src/commands.ts'
import { CronStoreError } from '../src/store.ts'
import type { CronDefinition, CronExecution, CronRuntimeState } from '../src/types.ts'

const A = 'session-a' as SessionId
const B = 'session-b' as SessionId
const C = 'session-c' as SessionId
const FOREIGN = 'session-foreign' as SessionId
const WORKSPACE = 'workspace-1' as WorkspaceId

function workspace(id: WorkspaceId, sessionIds: readonly SessionId[]): Workspace {
  return {
    id, path: `/tmp/${id}`, title: id, sessionIds,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    setTitle: async () => {}, attachSession: async () => {}, insertSessionBefore: async () => {},
    detachSession: async () => {}, status: async () => 'ok',
  }
}

class MemoryCommandStore {
  readonly definitions = new Map<string, CronDefinition>()
  readonly executions: CronExecution[] = []
  readonly runtime = new Map<string, CronRuntimeState>()

  async createDefinition(value: CronDefinition) {
    this.definitions.set(value.id, value)
    return value
  }

  async updateDefinition(
    id: ReturnType<typeof CronId>,
    revision: number,
    change: (value: CronDefinition) => CronDefinition,
  ) {
    const current = this.definitions.get(id)
    if (current === undefined) throw new Error('missing')
    if (current.revision !== revision) throw new CronStoreError('revision_conflict')
    if (current.state === 'deleted') throw new CronStoreError('definition_deleted')
    const next = { ...change(current), revision: revision + 1 }
    this.definitions.set(id, next)
    return next
  }

  listDefinitions() {
    return [...this.definitions.values()]
  }

  listHistory(query: { cronId?: ReturnType<typeof CronId>; cursor?: string; limit?: number } = {}) {
    const items = this.executions.filter(value => query.cronId === undefined || value.cronId === query.cronId)
    return { items }
  }
}

function harness(options?: { workspaces?: readonly Workspace[]; preset?: string }) {
  const store = new MemoryCommandStore()
  const agentContexts = new Map<SessionId, Context>([[A, new Context()], [B, new Context()], [C, new Context()]])
  const lifecycle = { changed: vi.fn(async () => {}) }
  let id = 0
  const commands = new CronCommandService({
    workspaceRegistry: {
      list: () => [...(options?.workspaces ?? [workspace(WORKSPACE, [A, B, C])])],
    },
    sessionController: {
      resolveAgent: async (sessionId) => {
        const ctx = agentContexts.get(sessionId)
        return ctx === undefined ? { error: { code: 'missing' } } : { agent: { ctx } }
      },
    },
    agentPresets: { composedPreset: () => options?.preset ?? 'standard' },
    library: { validate: () => ({ ok: true as const }) },
    store,
    lifecycle,
    createId: () => CronId(`cron-${++id}`),
    now: () => new Date('2026-09-07T00:00:00.000Z'),
  })
  return { commands, lifecycle, store }
}

const input = {
  name: '日报', expression: '0 9 * * *', timezone: 'Asia/Shanghai',
  prompt: '生成日报', executionMode: 'existing_session' as const,
}

describe('CronCommandService', () => {
  it('derives Workspace, creator, and fixed target on the Host', async () => {
    const { commands } = harness()
    const created = await commands.create(A, {
      ...input,
      workspaceId: 'attacker-workspace', targetSessionId: 'attacker-session',
    } as typeof input)

    expect(created).toMatchObject({
      workspaceId: WORKSPACE, createdFromSessionId: A, targetSessionId: A,
      state: 'active', revision: 1,
    })
    expect(created).not.toHaveProperty('agentPresetId')
  })

  it('captures the invoking Agent preset for fresh-Session mode and fails closed when absent', async () => {
    const { commands } = harness({ preset: 'minimal' })
    await expect(commands.create(A, { ...input, executionMode: 'new_session' }))
      .resolves.toMatchObject({ executionMode: 'new_session', agentPresetId: 'minimal' })

    const absent = harness({ preset: '' }).commands
    await expect(absent.create(A, { ...input, executionMode: 'new_session' }))
      .rejects.toMatchObject({ code: 'agent_preset_unavailable' })
  })

  it('returns the same not-found failure for foreign and unknown Cron ids', async () => {
    const foreignWorkspace = workspace('workspace-2' as WorkspaceId, [FOREIGN])
    const { commands } = harness({ workspaces: [workspace(WORKSPACE, [A]), foreignWorkspace] })
    const created = await commands.create(A, input)

    await expect(commands.pause(FOREIGN, created.id)).rejects.toMatchObject({ code: 'cron_not_found' })
    await expect(commands.pause(A, CronId('missing'))).rejects.toMatchObject({ code: 'cron_not_found' })
  })

  it('fails closed when a Session has zero or multiple Workspace owners', async () => {
    await expect(harness({ workspaces: [] }).commands.create(A, input))
      .rejects.toMatchObject({ code: 'workspace_context_unavailable' })
    await expect(harness({ workspaces: [
      workspace(WORKSPACE, [A]), workspace('workspace-2' as WorkspaceId, [A]),
    ] }).commands.create(A, input)).rejects.toMatchObject({ code: 'workspace_context_unavailable' })
  })

  it('recaptures the target only when switching execution mode', async () => {
    const { commands } = harness({ preset: 'minimal' })
    const created = await commands.create(A, input)
    const renamed = await commands.update(B, created.id, created.revision, { name: '新日报' })
    expect(renamed).toMatchObject({ targetSessionId: A, name: '新日报' })

    const switched = await commands.update(B, renamed.id, renamed.revision, {
      executionMode: 'new_session',
    })
    expect(switched).toMatchObject({ executionMode: 'new_session', agentPresetId: 'minimal' })
    expect(switched).not.toHaveProperty('targetSessionId')
  })

  it('pauses and deletes with pending-clear requests and never resumes deleted definitions', async () => {
    const { commands, lifecycle } = harness()
    const created = await commands.create(A, input)
    const paused = await commands.pause(A, created.id)
    expect(paused.state).toBe('paused')
    expect(lifecycle.changed).toHaveBeenLastCalledWith(created, paused, { clearPending: true })

    const resumed = await commands.resume(A, paused.id)
    expect(resumed.state).toBe('active')
    const deleted = await commands.delete(A, resumed.id)
    expect(deleted).toMatchObject({ state: 'deleted', deletedAt: expect.any(String) })
    expect(lifecycle.changed).toHaveBeenLastCalledWith(resumed, deleted, { clearPending: true })
    await expect(commands.resume(A, deleted.id)).rejects.toMatchObject({ code: 'cron_not_found' })
  })

  it('serializes mutations for the same Cron through lifecycle completion', async () => {
    const { commands, lifecycle } = harness()
    const created = await commands.create(A, input)
    lifecycle.changed.mockClear()
    let release!: () => void
    lifecycle.changed.mockImplementationOnce(async () => new Promise<void>((resolve) => { release = resolve }))

    const pausing = commands.pause(A, created.id)
    await vi.waitFor(() => { expect(lifecycle.changed).toHaveBeenCalledTimes(1) })
    const resuming = commands.resume(A, created.id)
    await Promise.resolve()
    expect(lifecycle.changed).toHaveBeenCalledTimes(1)

    release()
    await expect(Promise.all([pausing, resuming])).resolves.toMatchObject([
      { state: 'paused' }, { state: 'active' },
    ])
  })

  it('filters related, all, and deleted definitions inside the current Workspace', async () => {
    const { commands, store } = harness()
    const fromA = await commands.create(A, input)
    const fromB = await commands.create(B, { ...input, name: 'B task' })
    const deleted = await commands.delete(B, fromB.id)
    const historyOnly = await commands.create(B, { ...input, name: 'history task' })
    store.executions.push({
      id: CronExecutionId('execution-1'), cronId: historyOnly.id, trigger: 'on_time',
      delayed: false, state: 'succeeded', sessionId: C,
      finishedAt: '2026-09-07T01:00:00.000Z',
    })

    expect((await commands.list(A, 'related')).map(value => value.id)).toEqual([fromA.id])
    expect((await commands.list(C, 'related')).map(value => value.id)).toEqual([historyOnly.id])
    expect((await commands.list(A, 'all')).map(value => value.id)).toEqual([fromA.id, historyOnly.id])
    expect((await commands.list(A, 'deleted')).map(value => value.id)).toEqual([deleted.id])
  })
})
