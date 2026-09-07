import { Context } from '@deepseek-ai/cordis'
import Storage, { StorageError } from '@deepseek-ai/dsh-storage'
import type {
  KvUnit,
  KvUnitDescriptor,
  StorageBackend,
} from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { describe, expect, it } from 'vitest'
import { CronExecutionId, CronId } from '../src/brand.ts'
import { CronStore } from '../src/store.ts'
import type { CronDefinition, CronExecution, CronRuntimeState } from '../src/types.ts'

const at = (hour: number) => `2026-09-07T${String(hour).padStart(2, '0')}:00:00.000Z`

interface MemoryMedium {
  readonly tables: Map<string, Map<string, unknown>>
  global: unknown
}

class MemoryBackend implements StorageBackend {
  readonly media = new Map<string, MemoryMedium>()
  readonly versions = new Map<string, number>()

  readonly kv = {
    open: async (descriptor: KvUnitDescriptor): Promise<KvUnit> => {
      const version = this.versions.get(descriptor.name)
      if (version !== undefined && version !== descriptor.version) {
        throw new StorageError('version-mismatch', 'version mismatch')
      }
      this.versions.set(descriptor.name, descriptor.version)
      let medium = this.media.get(descriptor.name)
      if (medium === undefined) {
        medium = { tables: new Map(), global: null }
        this.media.set(descriptor.name, medium)
      }
      return {
        loadAll: async () => ({
          tables: Object.fromEntries([...medium.tables].map(([table, rows]) => [
            table, Object.fromEntries(rows),
          ])),
          global: medium.global,
        }),
        putRecord: async (table, key, value) => {
          let rows = medium.tables.get(table)
          if (rows === undefined) {
            rows = new Map()
            medium.tables.set(table, rows)
          }
          rows.set(key, value)
        },
        deleteRecord: async (table, key) => { medium.tables.get(table)?.delete(key) },
        setGlobal: async (value) => { medium.global = value },
        close: async () => {},
      }
    },
  }

  async close(): Promise<void> {}
}

async function openStore(backend = new MemoryBackend()) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', backend)
  const storageDomain = new DomainFacility(ctx, { backend: 'memory' })
  return { backend, store: await CronStore.open({ storageDomain }) }
}

function fixedDefinition(id = 'cron-1'): CronDefinition {
  return {
    id: CronId(id), workspaceId: 'workspace-1' as WorkspaceId, name: `任务 ${id}`,
    expression: '0 9 * * *', timezone: 'Asia/Shanghai', prompt: '生成日报',
    executionMode: 'existing_session', createdFromSessionId: 'session-1' as SessionId,
    targetSessionId: 'session-1' as SessionId, state: 'active', revision: 1,
    createdAt: at(0), updatedAt: at(0),
  }
}

function execution(id: string, cronId: string, finishedHour?: number): CronExecution {
  return {
    id: CronExecutionId(id), cronId: CronId(cronId), trigger: 'on_time',
    scheduledFor: at(finishedHour ?? 1), delayed: false,
    state: finishedHour === undefined ? 'running' : 'succeeded',
    startedAt: at(finishedHour ?? 1),
    ...(finishedHour === undefined ? {} : { finishedAt: at(finishedHour) }),
  }
}

describe('CronStore', () => {
  it('durably reopens definitions, pending runtime, and execution records', async () => {
    const { backend, store } = await openStore()
    const definition = fixedDefinition()
    const runtime: CronRuntimeState = {
      cronId: definition.id, observedAt: at(1),
      pendingOccurrence: {
        trigger: 'pending_after_run', scheduledFor: at(1), observedAt: at(2), delayed: true,
      },
    }
    await store.createDefinition(definition)
    await store.putRuntime(runtime)
    await store.beginExecution(execution('execution-1', 'cron-1'))
    await store.close()

    const reopened = (await openStore(backend)).store
    expect(reopened.listDefinitions()).toEqual([definition])
    expect(reopened.recover()).toMatchObject({
      activeDefinitions: [definition], runtime: [runtime],
      nonterminalExecutions: [{ id: 'execution-1', state: 'running' }],
    })
    await reopened.close()
  })

  it('uses atomic revision checks and preserves immutable identity', async () => {
    const { store } = await openStore()
    const created = await store.createDefinition(fixedDefinition())

    await expect(store.updateDefinition(created.id, 0, value => value))
      .rejects.toMatchObject({ code: 'revision_conflict' })
    await expect(store.updateDefinition(created.id, 1, value => ({
      ...value, workspaceId: 'workspace-2' as WorkspaceId,
    }))).rejects.toMatchObject({ code: 'immutable_identity' })
    await expect(store.updateDefinition(created.id, 1, value => ({
      ...value, createdFromSessionId: 'session-2' as SessionId,
    }))).rejects.toMatchObject({ code: 'immutable_identity' })

    const updated = await store.updateDefinition(created.id, 1, value => ({
      ...value, name: '新名称', updatedAt: at(1),
    }))
    expect(updated).toMatchObject({ name: '新名称', revision: 2 })
    await store.close()
  })

  it('makes deletion terminal', async () => {
    const { store } = await openStore()
    const created = await store.createDefinition(fixedDefinition())
    const deleted = await store.updateDefinition(created.id, 1, value => ({
      ...value, state: 'deleted', deletedAt: at(1), updatedAt: at(1),
    }))

    await expect(store.updateDefinition(deleted.id, 2, value => ({
      ...value, state: 'active', deletedAt: undefined, updatedAt: at(2),
    }))).rejects.toMatchObject({ code: 'definition_deleted' })
    expect(store.listDefinitions('deleted')).toEqual([deleted])
    await store.close()
  })

  it('orders history newest-first and paginates with opaque cursors', async () => {
    const { store } = await openStore()
    await store.beginExecution(execution('execution-1', 'cron-1', 1))
    await store.beginExecution(execution('execution-3', 'cron-1', 3))
    await store.beginExecution(execution('execution-2', 'cron-1', 2))

    const first = store.listHistory({ cronId: CronId('cron-1'), limit: 2 })
    expect(first.items.map(item => item.id)).toEqual(['execution-3', 'execution-2'])
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(first.nextCursor).not.toContain('2026-')
    const second = store.listHistory({
      cronId: CronId('cron-1'), limit: 2, cursor: first.nextCursor,
    })
    expect(second).toMatchObject({ items: [{ id: 'execution-1' }] })
    expect(second.nextCursor).toBeUndefined()
    await store.close()
  })

  it('rejects malformed cursors and caps pages at 100', async () => {
    const { store } = await openStore()
    expect(() => store.listHistory({ limit: 101 })).toThrow(expect.objectContaining({
      code: 'invalid_cursor',
    }))
    expect(() => store.listHistory({ cursor: 'not-a-cursor' })).toThrow(expect.objectContaining({
      code: 'invalid_cursor',
    }))
    await store.close()
  })

  it('surfaces orphan runtime and execution rows during recovery', async () => {
    const { store } = await openStore()
    await store.putRuntime({ cronId: CronId('orphan-runtime'), observedAt: at(1) })
    await store.beginExecution(execution('orphan-execution', 'missing-definition'))

    expect(store.recover()).toMatchObject({
      orphanRuntime: [{ cronId: 'orphan-runtime' }],
      orphanExecutions: [{ id: 'orphan-execution', cronId: 'missing-definition' }],
    })
    await store.close()
  })

  it('finishes executions without exposing a history deletion operation', async () => {
    const { store } = await openStore()
    const running = execution('execution-1', 'cron-1')
    await store.beginExecution(running)
    const finished = await store.finishExecution(running.id, 'failed', {
      failureCode: 'internal_error', finishedAt: at(2),
    })

    expect(finished).toMatchObject({ state: 'failed', failureCode: 'internal_error' })
    expect('deleteHistory' in store).toBe(false)
    await store.close()
  })
})
