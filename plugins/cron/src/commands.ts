import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import { CronId } from './brand.ts'
import { cronFailure } from './errors.ts'
import type { CronLibrary, CronValidation } from './node-cron-runtime.ts'
import type { HistoryPage, HistoryQuery } from './store.ts'
import { CronStoreError } from './store.ts'
import { canonicalTimeZone } from './timezone.ts'
import type { AgentPresetId, CronDefinition } from './types.ts'
import { workspaceForSession } from './workspace.ts'

interface SessionControllerPort {
  resolveAgent(sessionId: SessionId): Promise<
    { readonly agent: { readonly ctx: Context } } | { readonly error: unknown }
  >
}

interface AgentPresetsPort {
  composedPreset(agentCtx: Context): string | undefined
}

interface CronStorePort {
  createDefinition(value: CronDefinition): Promise<CronDefinition>
  updateDefinition(
    id: CronId,
    revision: number,
    change: (value: CronDefinition) => CronDefinition,
  ): Promise<CronDefinition>
  listDefinitions(): readonly CronDefinition[]
  listHistory(query?: HistoryQuery): HistoryPage
}

export interface CronLifecyclePort {
  changed(
    previous: CronDefinition | undefined,
    next: CronDefinition,
    options: { readonly clearPending: boolean },
  ): Promise<void>
}

export interface CronCommandDependencies {
  readonly workspaceRegistry: Pick<WorkspaceRegistry, 'list'>
  readonly sessionController: SessionControllerPort
  readonly agentPresets: AgentPresetsPort
  readonly library: Pick<CronLibrary, 'validate'>
  readonly store: CronStorePort
  readonly lifecycle?: CronLifecyclePort
  readonly createId?: () => CronId
  readonly now?: () => Date
}

interface DefinitionInput {
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly prompt: string
}

export type CronCreateInput = DefinitionInput & {
  readonly executionMode: CronDefinition['executionMode']
}

export type CronUpdateInput = Partial<DefinitionInput> & {
  readonly executionMode?: CronDefinition['executionMode']
}

export type CronListScope = 'related' | 'all' | 'deleted'

type CapturedTarget =
  | {
    readonly executionMode: 'existing_session'
    readonly targetSessionId: SessionId
    readonly agentPresetId?: never
  }
  | {
    readonly executionMode: 'new_session'
    readonly agentPresetId: AgentPresetId
    readonly targetSessionId?: never
  }

const noopLifecycle: CronLifecyclePort = { changed: async () => {} }

/** Workspace-authorized entry point shared by Tools and Client Remotes. */
export class CronCommandService {
  private readonly lifecycle: CronLifecyclePort
  private readonly createId: () => CronId
  private readonly now: () => Date
  private readonly tails = new Map<CronId, Promise<void>>()

  constructor(private readonly dependencies: CronCommandDependencies) {
    this.lifecycle = dependencies.lifecycle ?? noopLifecycle
    this.createId = dependencies.createId ?? (() => CronId(randomUUID()))
    this.now = dependencies.now ?? (() => new Date())
  }

  async create(sessionId: SessionId, input: CronCreateInput): Promise<CronDefinition> {
    const workspace = workspaceForSession(this.dependencies.workspaceRegistry, sessionId)
    const normalized = normalizeFields(input)
    this.assertRule(normalized)
    const target = await this.captureTarget(sessionId, input.executionMode)
    const timestamp = this.now().toISOString()
    const definition: CronDefinition = {
      id: this.createId(),
      workspaceId: workspace.id,
      ...normalized,
      ...target,
      createdFromSessionId: sessionId,
      state: 'active' as const,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const created = await this.dependencies.store.createDefinition(definition)
    await this.lifecycle.changed(undefined, created, { clearPending: false })
    return created
  }

  async update(
    sessionId: SessionId,
    id: CronId,
    expectedRevision: number,
    input: CronUpdateInput,
  ): Promise<CronDefinition> {
    return this.enqueue(id, () => this.updateNow(sessionId, id, expectedRevision, input))
  }

  private async updateNow(
    sessionId: SessionId,
    id: CronId,
    expectedRevision: number,
    input: CronUpdateInput,
  ): Promise<CronDefinition> {
    const current = this.definitionFor(sessionId, id)
    const mode = input.executionMode ?? current.executionMode
    const target = mode === current.executionMode
      ? undefined
      : await this.captureTarget(sessionId, mode)
    const normalized = normalizeFields({ ...current, ...input })
    this.assertRule(normalized)
    const updated = await this.dependencies.store.updateDefinition(id, expectedRevision, (value) => {
      if (target === undefined) {
        return { ...value, ...normalized, updatedAt: this.now().toISOString() }
      }
      const { targetSessionId: _target, agentPresetId: _preset, ...identity } = value
      return {
        ...identity,
        ...normalized,
        ...target,
        updatedAt: this.now().toISOString(),
      } as CronDefinition
    })
    await this.lifecycle.changed(current, updated, { clearPending: false })
    return updated
  }

  pause(sessionId: SessionId, id: CronId): Promise<CronDefinition> {
    return this.enqueue(id, () => this.changeState(sessionId, id, 'paused', true))
  }

  resume(sessionId: SessionId, id: CronId): Promise<CronDefinition> {
    return this.enqueue(id, () => this.changeState(sessionId, id, 'active', false))
  }

  delete(sessionId: SessionId, id: CronId): Promise<CronDefinition> {
    return this.enqueue(id, () => this.changeState(sessionId, id, 'deleted', true))
  }

  async list(sessionId: SessionId, scope: CronListScope): Promise<readonly CronDefinition[]> {
    const workspace = workspaceForSession(this.dependencies.workspaceRegistry, sessionId)
    const definitions = this.dependencies.store.listDefinitions()
      .filter(value => value.workspaceId === workspace.id)
    if (scope === 'deleted') return definitions.filter(value => value.state === 'deleted')
    const current = definitions.filter(value => value.state !== 'deleted')
    if (scope === 'all') return current
    const historyIds = this.executionCronIdsFor(sessionId)
    return current.filter(value =>
      value.createdFromSessionId === sessionId
      || (value.executionMode === 'existing_session' && value.targetSessionId === sessionId)
      || historyIds.has(value.id),
    )
  }

  history(sessionId: SessionId, id: CronId, query: Omit<HistoryQuery, 'cronId'> = {}): HistoryPage {
    this.definitionFor(sessionId, id, true)
    return this.dependencies.store.listHistory({ ...query, cronId: id })
  }

  private async changeState(
    sessionId: SessionId,
    id: CronId,
    state: 'active' | 'paused' | 'deleted',
    clearPending: boolean,
  ): Promise<CronDefinition> {
    const current = this.definitionFor(sessionId, id)
    try {
      const updated = await this.dependencies.store.updateDefinition(id, current.revision, value => ({
        ...value,
        state,
        updatedAt: this.now().toISOString(),
        ...(state === 'deleted' ? { deletedAt: this.now().toISOString() } : {}),
      }))
      await this.lifecycle.changed(current, updated, { clearPending })
      return updated
    } catch (error) {
      if (error instanceof CronStoreError && error.code === 'definition_deleted') {
        throw cronFailure('cron_not_found')
      }
      throw error
    }
  }

  private definitionFor(sessionId: SessionId, id: CronId, includeDeleted = false): CronDefinition {
    const workspace = workspaceForSession(this.dependencies.workspaceRegistry, sessionId)
    const definition = this.dependencies.store.listDefinitions().find(value => value.id === id)
    if (
      definition === undefined
      || definition.workspaceId !== workspace.id
      || (!includeDeleted && definition.state === 'deleted')
    ) {
      throw cronFailure('cron_not_found')
    }
    return definition
  }

  private async captureTarget(
    sessionId: SessionId,
    mode: CronDefinition['executionMode'],
  ): Promise<CapturedTarget> {
    if (mode === 'existing_session') {
      return { executionMode: mode, targetSessionId: sessionId }
    }
    const resolved = await this.dependencies.sessionController.resolveAgent(sessionId)
    if ('error' in resolved) throw cronFailure('target_session_unavailable')
    const preset = this.dependencies.agentPresets.composedPreset(resolved.agent.ctx)
    if (preset === undefined || preset.length === 0) throw cronFailure('agent_preset_unavailable')
    return { executionMode: mode, agentPresetId: preset as AgentPresetId }
  }

  private assertRule(rule: Pick<CronDefinition, 'expression' | 'timezone'>): void {
    const canonical = canonicalTimeZone(rule.timezone)
    if (canonical !== rule.timezone) throw cronFailure('invalid_timezone')
    const validation: CronValidation = this.dependencies.library.validate(rule)
    if (!validation.ok) throw cronFailure(validation.code)
  }

  private executionCronIdsFor(sessionId: SessionId): Set<CronId> {
    const ids = new Set<CronId>()
    let cursor: string | undefined
    do {
      const page = this.dependencies.store.listHistory({ limit: 100, ...(cursor === undefined ? {} : { cursor }) })
      for (const execution of page.items) {
        if (execution.sessionId === sessionId) ids.add(execution.cronId)
      }
      cursor = page.nextCursor
    } while (cursor !== undefined)
    return ids
  }

  private enqueue<T>(id: CronId, operation: () => Promise<T>): Promise<T> {
    const prior = this.tails.get(id) ?? Promise.resolve()
    const result = prior.then(operation, operation)
    const tail = result.then(() => {}, () => {})
    this.tails.set(id, tail)
    void tail.then(() => {
      if (this.tails.get(id) === tail) this.tails.delete(id)
    })
    return result
  }
}

function normalizeFields(input: DefinitionInput): DefinitionInput {
  return {
    name: input.name.trim(),
    expression: input.expression.trim().replace(/\s+/gu, ' '),
    timezone: input.timezone.trim(),
    prompt: input.prompt.trim(),
  }
}
