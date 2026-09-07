import type { Domain, DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { CronExecutionId, CronId } from './brand.ts'
import {
  cronDefinitionSchema,
  cronDomainSpec,
  cronExecutionSchema,
  cronRuntimeStateSchema,
} from './domain.ts'
import type {
  CronDefinition,
  CronExecution,
  CronFailureCode,
  CronRuntimeState,
} from './types.ts'

type StoreErrorCode =
  | 'definition_deleted'
  | 'duplicate_definition'
  | 'duplicate_execution'
  | 'immutable_identity'
  | 'invalid_cursor'
  | 'revision_conflict'

/** Bounded error raised by durable store invariants. */
export class CronStoreError extends Error {
  override readonly name = 'CronStoreError'

  constructor(readonly code: StoreErrorCode) {
    super(code)
  }
}

export interface HistoryQuery {
  readonly cronId?: CronId
  readonly cursor?: string
  readonly limit?: number
}

export interface HistoryPage {
  readonly items: readonly CronExecution[]
  readonly nextCursor?: string
}

export interface CronRecoveryState {
  readonly activeDefinitions: readonly CronDefinition[]
  readonly runtime: readonly CronRuntimeState[]
  readonly nonterminalExecutions: readonly CronExecution[]
  readonly orphanRuntime: readonly CronRuntimeState[]
  readonly orphanExecutions: readonly CronExecution[]
}

type TerminalState = Extract<CronExecution['state'],
  'succeeded' | 'failed' | 'cancelled' | 'coalesced'>

interface FinishPatch {
  readonly sessionId?: CronExecution['sessionId']
  readonly sessionRequestId?: CronExecution['sessionRequestId']
  readonly failureCode?: CronFailureCode
  readonly startedAt?: string
  readonly finishedAt: string
}

const cursorSchema = z.object({
  finishedAt: z.string(),
  id: z.string().min(1),
}).strict()

const terminalStates = new Set<CronExecution['state']>([
  'succeeded', 'failed', 'cancelled', 'coalesced',
])

/** Durable Cron storage over one plugin-owned storage domain. */
export class CronStore {
  private readonly definitions
  private readonly runtime
  private readonly executions

  private constructor(private readonly domain: Domain<typeof cronDomainSpec>) {
    this.definitions = domain.table('definitions')
    this.runtime = domain.table('runtime')
    this.executions = domain.table('executions')
  }

  static async open(ctx: { readonly storageDomain: DomainFacility }): Promise<CronStore> {
    return new CronStore(await ctx.storageDomain.open(cronDomainSpec))
  }

  async createDefinition(definition: CronDefinition): Promise<CronDefinition> {
    const value = cronDefinitionSchema.parse(definition)
    if (this.definitions.get(value.id) !== undefined) {
      throw new CronStoreError('duplicate_definition')
    }
    await this.definitions.put(value.id, value)
    return value
  }

  async updateDefinition(
    id: CronId,
    expectedRevision: number,
    change: (current: CronDefinition) => CronDefinition,
  ): Promise<CronDefinition> {
    return this.definitions.update(id, (current) => {
      if (current.revision !== expectedRevision) {
        throw new CronStoreError('revision_conflict')
      }
      if (current.state === 'deleted') {
        throw new CronStoreError('definition_deleted')
      }
      const changed = cronDefinitionSchema.parse(change(current))
      assertImmutableIdentity(current, changed)
      return cronDefinitionSchema.parse({
        ...changed,
        revision: current.revision + 1,
      })
    })
  }

  async putRuntime(runtime: CronRuntimeState): Promise<CronRuntimeState> {
    const value = cronRuntimeStateSchema.parse(runtime)
    await this.runtime.put(value.cronId, value)
    return value
  }

  async beginExecution(execution: CronExecution): Promise<CronExecution> {
    const value = cronExecutionSchema.parse(execution)
    if (this.executions.get(value.id) !== undefined) {
      throw new CronStoreError('duplicate_execution')
    }
    await this.executions.put(value.id, value)
    return value
  }

  async finishExecution(
    id: CronExecutionId,
    state: TerminalState,
    patch: FinishPatch,
  ): Promise<CronExecution> {
    return this.executions.update(id, current => cronExecutionSchema.parse({
      ...current,
      ...patch,
      state,
    }))
  }

  listDefinitions(scope: 'active' | 'deleted' | 'all' = 'all'): readonly CronDefinition[] {
    return [...this.definitions.entries()]
      .map(([, definition]) => definition)
      .filter(definition => scope === 'all' || definition.state === scope)
      .sort(compareDefinition)
  }

  listHistory(query: HistoryQuery = {}): HistoryPage {
    const limit = query.limit ?? 50
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new CronStoreError('invalid_cursor')
    }
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor)
    const sorted = [...this.executions.entries()]
      .map(([, execution]) => execution)
      .filter(execution => query.cronId === undefined || execution.cronId === query.cronId)
      .sort(compareExecution)
    const eligible = cursor === undefined
      ? sorted
      : sorted.filter(execution => compareExecutionToCursor(execution, cursor) > 0)
    const items = eligible.slice(0, limit)
    const nextCursor = eligible.length > limit
      ? encodeCursor(items.at(-1)!)
      : undefined
    return nextCursor === undefined ? { items } : { items, nextCursor }
  }

  recover(): CronRecoveryState {
    const definitions = this.listDefinitions('all')
    const knownCronIds = new Set(definitions.map(definition => definition.id))
    const runtime = [...this.runtime.entries()]
      .map(([, value]) => value)
      .sort((left, right) => left.cronId.localeCompare(right.cronId))
    const executions = [...this.executions.entries()]
      .map(([, value]) => value)
      .filter(value => !terminalStates.has(value.state))
      .sort(compareExecution)
    return {
      activeDefinitions: definitions.filter(definition => definition.state === 'active'),
      runtime,
      nonterminalExecutions: executions,
      orphanRuntime: runtime.filter(value => !knownCronIds.has(value.cronId)),
      orphanExecutions: executions.filter(value => !knownCronIds.has(value.cronId)),
    }
  }

  close(): Promise<void> {
    return this.domain.close()
  }
}

function assertImmutableIdentity(current: CronDefinition, next: CronDefinition): void {
  if (
    current.id !== next.id
    || current.workspaceId !== next.workspaceId
    || current.createdFromSessionId !== next.createdFromSessionId
    || current.createdAt !== next.createdAt
  ) {
    throw new CronStoreError('immutable_identity')
  }
}

function compareDefinition(left: CronDefinition, right: CronDefinition): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
}

function executionTime(execution: CronExecution): string {
  return execution.finishedAt ?? execution.startedAt ?? execution.scheduledFor ?? ''
}

function compareExecution(left: CronExecution, right: CronExecution): number {
  return executionTime(right).localeCompare(executionTime(left)) || right.id.localeCompare(left.id)
}

function compareExecutionToCursor(
  execution: CronExecution,
  cursor: z.infer<typeof cursorSchema>,
): number {
  return cursor.finishedAt.localeCompare(executionTime(execution)) || cursor.id.localeCompare(execution.id)
}

function encodeCursor(execution: CronExecution): string {
  return Buffer.from(JSON.stringify({
    finishedAt: executionTime(execution),
    id: execution.id,
  }), 'utf8').toString('base64url')
}

function decodeCursor(encoded: string): z.infer<typeof cursorSchema> {
  try {
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8')
    const cursor = cursorSchema.parse(JSON.parse(decoded))
    if (Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url') !== encoded) {
      throw new Error('non-canonical cursor')
    }
    return cursor
  } catch {
    throw new CronStoreError('invalid_cursor')
  }
}
