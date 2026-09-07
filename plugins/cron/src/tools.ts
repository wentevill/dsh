import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { CronId } from './brand.ts'
import type {
  CronCommandService,
  CronCreateInput,
  CronListScope,
  CronUpdateInput,
} from './commands.ts'
import { CronFailure } from './errors.ts'
import { CronStoreError } from './store.ts'
import { timezoneForOpenTurn } from './timezone.ts'
import type { CronDefinition, CronExecution } from './types.ts'

type Commands = Pick<CronCommandService,
  'create' | 'update' | 'pause' | 'resume' | 'delete' | 'list' | 'history'>

const mode = { type: 'string', enum: ['existing_session', 'new_session'] } as const
const scope = { type: 'string', enum: ['related', 'all', 'deleted'] } as const
const cronId = { type: 'string' } as const
const limit = { type: 'integer' } as const
const cursor = { type: 'string' } as const
const fieldParameters = {
  name: { type: 'string' }, expression: { type: 'string' }, timezone: { type: 'string' },
  prompt: { type: 'string' }, executionMode: mode,
} as const

const errorSchema = {
  type: 'object', additionalProperties: false,
  properties: { code: { type: 'string', required: true } },
} as const
const failureSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    ok: { type: 'boolean', const: false, required: true },
    error: { ...errorSchema, required: true },
  },
} as const
const definitionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', required: true }, name: { type: 'string', required: true },
    expression: { type: 'string', required: true }, timezone: { type: 'string', required: true },
    executionMode: { ...mode, required: true },
    state: { type: 'string', enum: ['active', 'paused', 'deleted'], required: true },
    revision: { type: 'integer', required: true },
  },
} as const
const mutationOutput = {
  oneOf: [
    {
      type: 'object', additionalProperties: false,
      properties: {
        ok: { type: 'boolean', const: true, required: true },
        cron: { ...definitionSchema, required: true },
      },
    },
    failureSchema,
  ],
} as const
const render = (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }]

/** Build the complete model-facing Cron tool set. */
export function createCronTools(commands: Commands): readonly ToolDefinition[] {
  const definitions = [
    defineTool({
      name: 'cron_list', description: 'List Cron tasks in the current Workspace.',
      parameters: { scope, limit },
      output: {
        schema: { oneOf: [{
          type: 'object', additionalProperties: false,
          properties: {
            ok: { type: 'boolean', const: true, required: true },
            items: { type: 'array', items: definitionSchema, required: true },
          },
        }, failureSchema] }, render,
      },
      async execute(args, exec) {
        return outcome(exec, async (sessionId) => {
          const pageLimit = boundedLimit(args.limit)
          const items = await commands.list(sessionId, (args.scope ?? 'related') as CronListScope)
          return { ok: true as const, items: items.slice(0, pageLimit).map(definitionSummary) }
        })
      },
    }),
    defineTool({
      name: 'cron_history', description: 'List execution history for one Cron task.',
      parameters: { cronId: { ...cronId, required: true }, cursor, limit },
      output: {
        schema: { oneOf: [{
          type: 'object', additionalProperties: false,
          properties: {
            ok: { type: 'boolean', const: true, required: true },
            items: { type: 'array', items: executionSchema, required: true },
            nextCursor: { type: 'string' },
          },
        }, failureSchema] }, render,
      },
      async execute(args, exec) {
        return outcome(exec, async (sessionId) => {
          const page = commands.history(sessionId, CronId(args.cronId), {
            limit: boundedLimit(args.limit),
            ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
          })
          return {
            ok: true as const,
            items: page.items.map(executionSummary),
            ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
          }
        })
      },
    }),
    defineTool({
      name: 'cron_open_manager', description: 'Suggest opening the Cron manager in this conversation.',
      parameters: {},
      output: {
        schema: { oneOf: [suggestionSchema, failureSchema] }, render,
      },
      async execute(_args, exec) {
        const sessionId = invokingSession(exec)
        return sessionId === undefined
          ? failure('workspace_context_unavailable')
          : { kind: 'cron-manager-suggestion' as const, scope: 'related' as const, sessionId }
      },
    }),
    defineTool({
      name: 'cron_create', description: 'Create a persistent Cron task in the current Workspace.',
      parameters: {
        name: { type: 'string', required: true },
        expression: { type: 'string', required: true },
        timezone: { type: 'string' },
        prompt: { type: 'string', required: true },
        executionMode: { ...mode, required: true },
      },
      output: { schema: mutationOutput, render },
      async execute(args, exec) {
        return outcome(exec, async (sessionId) => {
          const timezone = args.timezone ?? timezoneForOpenTurn(exec.agent!.session.events as SessionEvent[])
          const created = await commands.create(sessionId, { ...args, timezone } as CronCreateInput)
          return { ok: true as const, cron: definitionSummary(created) }
        })
      },
    }),
    defineTool({
      name: 'cron_update', description: 'Update one Cron task in the current Workspace.',
      parameters: {
        cronId: { ...cronId, required: true }, revision: { type: 'integer', required: true },
        ...fieldParameters,
      },
      output: { schema: mutationOutput, render },
      async execute(args, exec) {
        return outcome(exec, async (sessionId) => {
          const { cronId: id, revision, ...change } = args
          const updated = await commands.update(sessionId, CronId(id), revision, change as CronUpdateInput)
          return { ok: true as const, cron: definitionSummary(updated) }
        })
      },
    }),
    mutationTool('cron_pause', 'Pause one Cron task.', commands.pause.bind(commands)),
    mutationTool('cron_resume', 'Resume one Cron task.', commands.resume.bind(commands)),
    mutationTool('cron_delete', 'Delete one Cron task.', commands.delete.bind(commands)),
  ]
  return definitions.map(strictRoot)
}

const executionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string', required: true }, cronId: { type: 'string', required: true },
    trigger: { type: 'string', required: true }, state: { type: 'string', required: true },
    scheduledFor: { type: 'string' }, delayed: { type: 'boolean', required: true },
    failureCode: { type: 'string' }, startedAt: { type: 'string' }, finishedAt: { type: 'string' },
  },
} as const
const suggestionSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    kind: { type: 'string', const: 'cron-manager-suggestion', required: true },
    scope: { type: 'string', const: 'related', required: true },
    sessionId: { type: 'string', required: true },
  },
} as const

function mutationTool(
  name: 'cron_pause' | 'cron_resume' | 'cron_delete',
  description: string,
  command: (sessionId: SessionId, id: CronId) => Promise<CronDefinition>,
): ToolDefinition {
  return defineTool({
    name, description, parameters: { cronId: { ...cronId, required: true } },
    output: { schema: mutationOutput, render },
    async execute(args, exec) {
      return outcome(exec, async sessionId => ({
        ok: true as const, cron: definitionSummary(await command(sessionId, CronId(args.cronId))),
      }))
    },
  })
}

async function outcome<T>(
  exec: ToolRunContext,
  operation: (sessionId: SessionId) => Promise<T> | T,
): Promise<T | ReturnType<typeof failure>> {
  const sessionId = invokingSession(exec)
  if (sessionId === undefined) return failure('workspace_context_unavailable')
  try {
    return await operation(sessionId)
  } catch (error) {
    if (error instanceof CronToolInputError) return failure('invalid_request')
    if (error instanceof CronFailure || error instanceof CronStoreError) return failure(error.code)
    return failure('internal_error')
  }
}

function invokingSession(exec: ToolRunContext): SessionId | undefined {
  return exec.agent?.session.id
}

function boundedLimit(value: number | undefined): number {
  const normalized = value ?? 50
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 100) {
    throw new CronToolInputError()
  }
  return normalized
}

class CronToolInputError extends Error {}

function strictRoot(tool: ToolDefinition): ToolDefinition {
  const parameters = tool.parameters as {
    readonly properties?: Readonly<Record<string, unknown>>
  }
  const allowed = new Set(Object.keys(parameters.properties ?? {}))
  return {
    ...tool,
    parameters: { ...tool.parameters, additionalProperties: false },
    async execute(args, exec) {
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        throw new CronToolInputError()
      }
      for (const key of Object.keys(args)) {
        if (!allowed.has(key)) throw new CronToolInputError()
      }
      return tool.execute(args, exec)
    },
  }
}

function failure(code: string) {
  return { ok: false as const, error: { code } }
}

function definitionSummary(value: CronDefinition) {
  return {
    id: value.id, name: value.name, expression: value.expression, timezone: value.timezone,
    executionMode: value.executionMode, state: value.state, revision: value.revision,
  }
}

function executionSummary(value: CronExecution) {
  return {
    id: value.id, cronId: value.cronId, trigger: value.trigger, state: value.state,
    delayed: value.delayed,
    ...(value.scheduledFor === undefined ? {} : { scheduledFor: value.scheduledFor }),
    ...(value.failureCode === undefined ? {} : { failureCode: value.failureCode }),
    ...(value.startedAt === undefined ? {} : { startedAt: value.startedAt }),
    ...(value.finishedAt === undefined ? {} : { finishedAt: value.finishedAt }),
  }
}
