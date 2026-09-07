import type { CronExecutionId, CronId } from './brand.ts'
import { CronExecutionId as makeCronExecutionId } from './brand.ts'
import type { CronLifecyclePort } from './commands.ts'
import type { CronLibrary, LiveCron } from './node-cron-runtime.ts'
import { reduceCronRuntime } from './state-machine.ts'
import type {
  CronMachineEffect,
  CronMachineState,
} from './state-machine.ts'
import type { CronRecoveryState } from './store.ts'
import type {
  CronDefinition,
  CronExecution,
  CronOccurrence,
  CronRuntimeState,
} from './types.ts'

interface RuntimeStorePort {
  recover(): CronRecoveryState
  beginExecution(execution: CronExecution): Promise<CronExecution>
  putRuntime(runtime: CronRuntimeState): Promise<CronRuntimeState>
}

interface RuntimeDependencies {
  readonly store: RuntimeStorePort
  readonly library: Pick<CronLibrary, 'start'>
  readonly dispatch: (execution: CronExecution, definition: CronDefinition) => Promise<void>
  readonly createExecutionId?: () => CronExecutionId
  readonly now?: () => Date
}

/** Owns live node-cron tasks and durable single-flight orchestration. */
export class CronRuntime implements CronLifecyclePort {
  private readonly definitions = new Map<CronId, CronDefinition>()
  private readonly states = new Map<CronId, CronMachineState>()
  private readonly live = new Map<CronId, LiveCron>()
  private readonly tails = new Map<CronId, Promise<void>>()
  private readonly createExecutionId: () => CronExecutionId
  private readonly now: () => Date
  private disposed = false

  constructor(private readonly dependencies: RuntimeDependencies) {
    this.createExecutionId = dependencies.createExecutionId
      ?? (() => makeCronExecutionId(crypto.randomUUID()))
    this.now = dependencies.now ?? (() => new Date())
  }

  async initialize(): Promise<void> {
    const recovery = this.dependencies.store.recover()
    const runtimeById = new Map(recovery.runtime.map(value => [value.cronId, value]))
    for (const definition of recovery.activeDefinitions) {
      this.definitions.set(definition.id, definition)
      const observedAt = this.now().toISOString()
      const persisted = runtimeById.get(definition.id) ?? { cronId: definition.id, observedAt }
      const recoveredExecution = recovery.nonterminalExecutions.find(value => value.cronId === definition.id)
      const oldRuntime = persisted.activeExecutionId === undefined && recoveredExecution !== undefined
        ? { ...persisted, activeExecutionId: recoveredExecution.id }
        : persisted
      this.states.set(definition.id, { definitionState: 'active', runtime: oldRuntime })
      const live = this.register(definition)
      const checkpointed = withCheckpoint(oldRuntime, live.nextRunAt(), observedAt)
      this.states.set(definition.id, { definitionState: 'active', runtime: checkpointed })
      await this.dependencies.store.putRuntime(compactRuntime(checkpointed))

      if (isOverdue(oldRuntime, observedAt)) {
        await this.enqueue(definition.id, () => this.fire(definition.id, {
          trigger: 'startup_catch_up',
          scheduledFor: oldRuntime.libraryNextRunAt!,
          observedAt,
          delayed: true,
          coalescedThrough: observedAt,
        }))
      }
    }
  }

  changed(
    previous: CronDefinition | undefined,
    next: CronDefinition,
    options: { readonly clearPending: boolean },
  ): Promise<void> {
    return this.definitionChanged(previous, next, options)
  }

  definitionChanged(
    previous: CronDefinition | undefined,
    next: CronDefinition,
    options: { readonly clearPending: boolean },
  ): Promise<void> {
    return this.enqueue(next.id, () => this.applyDefinitionChange(previous, next, options))
  }

  executionFinished(cronId: CronId, executionId: CronExecutionId): Promise<void> {
    return this.enqueue(cronId, async () => {
      const state = this.states.get(cronId)
      const definition = this.definitions.get(cronId)
      if (state === undefined || definition === undefined) return
      const transition = reduceCronRuntime(state, {
        kind: 'execution_finished', executionId,
        nextExecutionId: this.createExecutionId(), observedAt: this.now().toISOString(),
      })
      this.states.set(cronId, transition.next)
      await this.applyOccurrenceEffects(definition, transition.next.runtime, transition.effects)
    })
  }

  async dispose(): Promise<void> {
    this.disposed = true
    await Promise.all([...this.live.values()].map(task => task.destroy()))
    this.live.clear()
    await Promise.all([...this.tails.values()])
  }

  private async applyDefinitionChange(
    previous: CronDefinition | undefined,
    next: CronDefinition,
    options: { readonly clearPending: boolean },
  ): Promise<void> {
    this.definitions.set(next.id, next)
    const current = this.states.get(next.id) ?? {
      definitionState: previous?.state ?? next.state,
      runtime: { cronId: next.id, observedAt: this.now().toISOString() },
    }
    if (next.state === 'active') {
      await this.live.get(next.id)?.destroy()
      this.live.delete(next.id)
      const runtime = options.clearPending
        ? { ...current.runtime, pendingOccurrence: undefined }
        : current.runtime
      const live = this.register(next)
      const checkpointed = withCheckpoint(runtime, live.nextRunAt(), this.now().toISOString())
      this.states.set(next.id, { definitionState: 'active', runtime: checkpointed })
      await this.dependencies.store.putRuntime(compactRuntime(checkpointed))
      return
    }

    const event = next.state === 'paused' ? { kind: 'pause' as const } : { kind: 'delete' as const }
    const transition = reduceCronRuntime(current, event)
    this.states.set(next.id, transition.next)
    await this.applyControlEffects(next, transition.effects)
    await this.dependencies.store.putRuntime(compactRuntime(transition.next.runtime))
  }

  private register(definition: CronDefinition): LiveCron {
    const live = this.dependencies.library.start(definition, scheduledFor => this.enqueue(
      definition.id,
      () => this.fire(definition.id, {
        trigger: 'on_time', scheduledFor: scheduledFor.toISOString(),
        observedAt: this.now().toISOString(), delayed: false,
      }),
    ))
    this.live.set(definition.id, live)
    return live
  }

  private async fire(cronId: CronId, occurrence: CronOccurrence): Promise<void> {
    if (this.disposed) return
    const state = this.states.get(cronId)
    const definition = this.definitions.get(cronId)
    if (state === undefined || definition === undefined) return
    const transition = reduceCronRuntime(state, {
      kind: 'fire', occurrence, executionId: this.createExecutionId(),
    })
    const runtime = withCheckpoint(
      transition.next.runtime,
      this.live.get(cronId)?.nextRunAt(),
      occurrence.observedAt,
    )
    this.states.set(cronId, { ...transition.next, runtime })
    await this.applyOccurrenceEffects(definition, runtime, transition.effects)
  }

  private async applyOccurrenceEffects(
    definition: CronDefinition,
    runtime: CronRuntimeState,
    effects: readonly CronMachineEffect[],
  ): Promise<void> {
    const dispatch: CronExecution[] = []
    for (const effect of effects) {
      if (effect.kind === 'begin') {
        const execution = executionFor(definition.id, effect.executionId, effect.occurrence, 'queued')
        await this.dependencies.store.beginExecution(execution)
        dispatch.push(execution)
      } else if (effect.kind === 'coalesce') {
        await this.dependencies.store.beginExecution(executionFor(
          definition.id, this.createExecutionId(), effect.occurrence, 'coalesced', this.now().toISOString(),
        ))
      }
    }
    await this.dependencies.store.putRuntime(compactRuntime(runtime))
    for (const execution of dispatch) {
      await this.dependencies.dispatch(execution, definition)
    }
  }

  private async applyControlEffects(
    definition: CronDefinition,
    effects: readonly CronMachineEffect[],
  ): Promise<void> {
    for (const effect of effects) {
      if (effect.kind === 'stop_timer') await this.live.get(definition.id)?.stop()
      if (effect.kind === 'destroy_timer') {
        await this.live.get(definition.id)?.destroy()
        this.live.delete(definition.id)
      }
      if (effect.kind === 'coalesce') {
        await this.dependencies.store.beginExecution(executionFor(
          definition.id, this.createExecutionId(), effect.occurrence, 'coalesced', this.now().toISOString(),
        ))
      }
    }
  }

  private enqueue(id: CronId, operation: () => Promise<void>): Promise<void> {
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

function executionFor(
  cronId: CronId,
  id: CronExecutionId,
  occurrence: CronOccurrence,
  state: 'queued' | 'coalesced',
  finishedAt?: string,
): CronExecution {
  return {
    id, cronId, trigger: occurrence.trigger, scheduledFor: occurrence.scheduledFor,
    delayed: occurrence.delayed,
    ...(occurrence.coalescedThrough === undefined ? {} : { coalescedThrough: occurrence.coalescedThrough }),
    state,
    ...(finishedAt === undefined ? {} : { finishedAt }),
  }
}

function isOverdue(runtime: CronRuntimeState, observedAt: string): boolean {
  return runtime.libraryNextRunAt !== undefined
    && runtime.libraryNextRunAt > runtime.observedAt
    && runtime.libraryNextRunAt <= observedAt
}

function withCheckpoint(
  runtime: CronRuntimeState,
  nextRun: Date | undefined,
  observedAt: string,
): CronRuntimeState {
  return {
    ...runtime,
    observedAt,
    ...(nextRun === undefined ? {} : { libraryNextRunAt: nextRun.toISOString() }),
  }
}

function compactRuntime(runtime: CronRuntimeState): CronRuntimeState {
  return Object.fromEntries(Object.entries(runtime).filter(([, value]) => value !== undefined)) as unknown as CronRuntimeState
}
