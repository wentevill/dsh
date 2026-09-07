import { createHash } from 'node:crypto'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { CronExecutionId } from './brand.ts'
import type { CronExecutionTracker, CronObservedEvent } from './tracker.ts'
import type { CronDefinition, CronExecution } from './types.ts'

interface SessionLike {
  readonly id: SessionId
  readonly events: readonly unknown[]
}

interface AgentLike {
  readonly session: SessionLike
}

interface SessionControllerPort {
  create(request: {
    readonly sessionId: SessionId
    readonly workspaceId: WorkspaceId
    readonly agentPreset: string
  }): Promise<{ readonly sessionId: SessionId }>
  resolveAgent(sessionId: SessionId): Promise<
    { readonly agent: AgentLike } | { readonly error: unknown }
  >
  prompt(request: {
    readonly requestId: SessionRequestId
    readonly sessionId: SessionId
    readonly mode: 'queue'
    readonly content: readonly [{ readonly type: 'text'; readonly text: string }]
  }, signal: AbortSignal): Promise<{ readonly accepted: true }>
  inspect(sessionId: SessionId): Promise<{ readonly meta: unknown; readonly events: readonly unknown[] }>
}

interface ExecutionStorePort {
  updateExecution(
    id: CronExecutionId,
    change: (execution: CronExecution) => CronExecution,
  ): Promise<CronExecution>
}

interface PermissionPresetsPort {
  resolve(name: string): unknown
  set(session: SessionLike, name: string): void
}

interface ExecutionDependencies {
  readonly store: ExecutionStorePort
  readonly sessionController: SessionControllerPort
  readonly permissionPresets: PermissionPresetsPort
  readonly workspaceRegistry: Pick<WorkspaceRegistry, 'get'>
  readonly tracker: CronExecutionTracker
  readonly now?: () => Date
}

/** Derive a stable Session identity from one execution identity. */
export function sessionIdForExecution(executionId: CronExecutionId): SessionId {
  return `cron-session-v1-${stableDigest('session', executionId)}` as SessionId
}

/** Derive a stable prompt request identity from one execution identity. */
export function requestIdForExecution(executionId: CronExecutionId): SessionRequestId {
  return `cron-request-v1-${stableDigest('request', executionId)}` as SessionRequestId
}

/** Dispatches and recovers Session work for durable Cron executions. */
export class CronExecutionService {
  private readonly controllers = new Map<CronExecutionId, AbortController>()
  private readonly now: () => Date
  private disposed = false

  constructor(private readonly dependencies: ExecutionDependencies) {
    this.now = dependencies.now ?? (() => new Date())
  }

  async dispatch(execution: CronExecution, definition: CronDefinition): Promise<void> {
    const sessionId = definition.executionMode === 'existing_session'
      ? definition.targetSessionId
      : sessionIdForExecution(execution.id)
    const prepared = await this.dependencies.store.updateExecution(execution.id, value => ({
      ...value,
      sessionId,
      sessionRequestId: requestIdForExecution(execution.id),
      state: 'running',
      startedAt: value.startedAt ?? this.now().toISOString(),
    }))
    this.dependencies.tracker.track(prepared)
    await this.submitPrepared(prepared, definition)
  }

  async recover(execution: CronExecution, definition: CronDefinition): Promise<void> {
    if (execution.sessionId === undefined || execution.sessionRequestId === undefined) {
      await this.dispatch(execution, definition)
      return
    }
    this.dependencies.tracker.track(execution)
    let events: readonly unknown[]
    try {
      events = (await this.dependencies.sessionController.inspect(execution.sessionId)).events
    } catch {
      await this.submitPrepared(execution, definition)
      return
    }
    for (const event of events) {
      this.dependencies.tracker.observe(execution.sessionId, event as CronObservedEvent)
    }
    await this.dependencies.tracker.flush()
    if (events.some(event => rpcIdOf(event) === execution.sessionRequestId)) return
    await this.submitPrepared(execution, definition)
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const controller of this.controllers.values()) controller.abort()
    await this.dependencies.tracker.flush()
    this.dependencies.tracker.dispose()
    this.controllers.clear()
  }

  private async submitPrepared(execution: CronExecution, definition: CronDefinition): Promise<void> {
    if (this.disposed) return
    if (definition.executionMode === 'existing_session' && !this.fixedTargetStillOwned(definition)) {
      await this.dependencies.tracker.fail(execution, 'target_session_unavailable')
      return
    }
    try {
      if (definition.executionMode === 'new_session') {
        await this.dependencies.sessionController.create({
          sessionId: execution.sessionId!,
          workspaceId: definition.workspaceId,
          agentPreset: definition.agentPresetId,
        })
      }
    } catch {
      await this.dependencies.tracker.fail(execution, 'target_session_unavailable')
      return
    }

    let resolved: Awaited<ReturnType<SessionControllerPort['resolveAgent']>>
    try {
      resolved = await this.dependencies.sessionController.resolveAgent(execution.sessionId!)
    } catch {
      await this.dependencies.tracker.fail(execution, 'target_session_unavailable')
      return
    }
    if ('error' in resolved) {
      await this.dependencies.tracker.fail(execution, 'target_session_unavailable')
      return
    }
    if (definition.executionMode === 'new_session') {
      try {
        this.dependencies.permissionPresets.resolve('workspace-write')
        this.dependencies.permissionPresets.set(resolved.agent.session, 'workspace-write')
      } catch {
        await this.dependencies.tracker.fail(execution, 'internal_error')
        return
      }
    }
    const controller = new AbortController()
    this.controllers.set(execution.id, controller)
    try {
      await this.dependencies.sessionController.prompt({
        sessionId: execution.sessionId!,
        requestId: execution.sessionRequestId!,
        mode: 'queue',
        content: [{ type: 'text', text: definition.prompt }],
      }, controller.signal)
    } catch {
      if (!this.disposed) await this.dependencies.tracker.fail(execution, 'prompt_rejected')
    } finally {
      this.controllers.delete(execution.id)
    }
  }

  private fixedTargetStillOwned(definition: Extract<CronDefinition, { executionMode: 'existing_session' }>): boolean {
    const workspace = this.dependencies.workspaceRegistry.get(definition.workspaceId)
    return workspace !== undefined && workspace.sessionIds.includes(definition.targetSessionId)
  }
}

function stableDigest(kind: 'session' | 'request', executionId: CronExecutionId): string {
  return createHash('sha256')
    .update(`dsh-cron/${kind}/v1\0${executionId}`, 'utf8')
    .digest('base64url')
}

function rpcIdOf(event: unknown): string | undefined {
  if (typeof event !== 'object' || event === null) return undefined
  const record = event as Record<string, unknown>
  if (record['type'] !== 'user/message') return undefined
  const data = record['data']
  if (typeof data !== 'object' || data === null) return undefined
  const source = (data as Record<string, unknown>)['source']
  if (typeof source !== 'object' || source === null) return undefined
  const rpcId = (source as Record<string, unknown>)['rpcId']
  return typeof rpcId === 'string' ? rpcId : undefined
}
