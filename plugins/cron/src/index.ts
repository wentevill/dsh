import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-api-session-controller'
import type {} from '@deepseek-ai/dsh-permission-presets'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-workspace'
import { createCronApprovalPolicy } from './approval.ts'
import { CronCommandService } from './commands.ts'
import { CronExecutionService } from './execution.ts'
import { CronLibrary } from './node-cron-runtime.ts'
import { CronRemote } from './remote.ts'
import { CronRuntime } from './runtime.ts'
import { CronStore } from './store.ts'
import { createCronTools } from './tools.ts'
import { CronExecutionTracker } from './tracker.ts'

export * from './brand.ts'
export * from './approval.ts'
export * from './commands.ts'
export * from './domain.ts'
export * from './errors.ts'
export * from './execution.ts'
export * from './node-cron-runtime.ts'
export * from './remote.ts'
export type * from './remote-types.ts'
export * from './runtime.ts'
export * from './state-machine.ts'
export * from './store.ts'
export * from './timezone.ts'
export * from './tools.ts'
export * from './tracker.ts'
export type * from './types.ts'
export * from './workspace.ts'

export const name = 'cron'
export const inject = [
  'tools', 'storageDomain', 'workspaceRegistry', 'sessionController',
  'permissionPresets', 'agentPresets', 'sessions',
]

/** Compose the standalone Cron Host from public Harness plugin services. */
export async function apply(ctx: Context): Promise<void> {
  const logger = ctx.logger('cron')
  const store = await CronStore.open(ctx)
  let runtime!: CronRuntime
  let execution!: CronExecutionService
  let stopSessionEvents: (() => void) | undefined
  let stopApproval: (() => void) | undefined
  const stopTools: Array<() => void> = []

  const tracker = new CronExecutionTracker({
    store,
    executionFinished: (cronId, executionId) => runtime.executionFinished(cronId, executionId),
  })
  execution = new CronExecutionService({
    store,
    sessionController: ctx.sessionController,
    permissionPresets: ctx.permissionPresets,
    workspaceRegistry: ctx.workspaceRegistry,
    tracker,
  })
  const library = new CronLibrary()
  runtime = new CronRuntime({
    store,
    library,
    dispatch: (item, definition) => execution.dispatch(item, definition),
    registrationFailed: () => logger.warn(
      'operation=register outcome=failed reason=library_rejected_definition',
    ),
  })
  const commands = new CronCommandService({
    workspaceRegistry: ctx.workspaceRegistry,
    sessionController: ctx.sessionController,
    agentPresets: ctx.agentPresets,
    library,
    store,
    lifecycle: runtime,
  })

  const dispose = async () => {
    const failures: unknown[] = []
    const failed = (operation: string, error: unknown) => {
      failures.push(error)
      logger.warn(`operation=${operation} outcome=failed reason=dispose_failed`)
    }
    for (const stop of stopTools.splice(0).reverse()) {
      try { stop() } catch (error) { failed('tool_dispose', error) }
    }
    try { stopApproval?.() } catch (error) { failed('approval_dispose', error) }
    stopApproval = undefined
    try { stopSessionEvents?.() } catch (error) { failed('session_observer_dispose', error) }
    stopSessionEvents = undefined
    for (const [operation, close] of [
      ['runtime_dispose', () => runtime.dispose()],
      ['execution_dispose', () => execution.dispose()],
      ['store_close', () => store.close()],
    ] as const) {
      try { await close() } catch (error) { failed(operation, error) }
    }
    if (failures.length > 0) throw new Error('Cron Host disposal failed')
  }

  try {
    stopSessionEvents = ctx.on('session/event', (session, event) => {
      tracker.observe(session, event)
    })
    const recovery = store.recover()
    await runtime.initialize()
    const definitions = new Map(store.listDefinitions('all').map(value => [value.id, value]))
    for (const item of recovery.nonterminalExecutions) {
      const definition = definitions.get(item.cronId)
      if (definition !== undefined) await execution.recover(item, definition)
      else await tracker.fail(item, 'internal_error')
    }
    for (const tool of createCronTools(commands)) stopTools.push(ctx.tools.register(tool))
    const approval = createCronApprovalPolicy()
    stopApproval = ctx.on('tools/pre-execute', (tool, next) => approval(tool, next))
    new CronRemote(ctx, commands)
    ctx.effect(() => dispose, 'cron.host')
  } catch (error) {
    try { await dispose() } catch {}
    throw error
  }
}
