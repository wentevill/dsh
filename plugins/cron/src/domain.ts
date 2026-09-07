import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionRequestId } from '@deepseek-ai/dsh-api-session-controller/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { z } from 'zod'
import { CronExecutionId, CronId } from './brand.ts'
import type {
  AgentPresetId,
  CronDefinition,
  CronExecution,
  CronFailureCode,
  CronOccurrence,
  CronRuntimeState,
} from './types.ts'

const timestamp = z.iso.datetime()
const cronId = z.string().min(1).transform(CronId)
const executionId = z.string().min(1).transform(CronExecutionId)
const sessionId = z.string().min(1).transform(value => value as SessionId)
const workspaceId = z.string().min(1).transform(value => value as WorkspaceId)
const agentPresetId = z.string().min(1).transform(value => value as AgentPresetId)
const sessionRequestId = z.string().min(1).transform(value => value as SessionRequestId)

const definitionBase = z.object({
  id: cronId,
  workspaceId,
  name: z.string().trim().min(1),
  expression: z.string().trim().min(1),
  timezone: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  createdFromSessionId: sessionId,
  state: z.enum(['active', 'paused', 'deleted']),
  revision: z.number().int().positive(),
  createdAt: timestamp,
  updatedAt: timestamp,
  deletedAt: timestamp.optional(),
})

/** Strict durable definition schema excluding impossible execution targets. */
export const cronDefinitionSchema = z.discriminatedUnion('executionMode', [
  definitionBase.extend({
    executionMode: z.literal('existing_session'),
    targetSessionId: sessionId,
  }).strict(),
  definitionBase.extend({
    executionMode: z.literal('new_session'),
    agentPresetId,
  }).strict(),
]) as z.ZodType<CronDefinition>

/** Strict durable occurrence schema. */
export const cronOccurrenceSchema = z.object({
  trigger: z.enum(['on_time', 'startup_catch_up', 'pending_after_run']),
  scheduledFor: timestamp,
  observedAt: timestamp,
  delayed: z.boolean(),
  coalescedThrough: timestamp.optional(),
}).strict() as z.ZodType<CronOccurrence>

/** Strict durable runtime schema. */
export const cronRuntimeStateSchema = z.object({
  cronId,
  libraryNextRunAt: timestamp.optional(),
  observedAt: timestamp,
  activeExecutionId: executionId.optional(),
  pendingOccurrence: cronOccurrenceSchema.optional(),
}).strict() as z.ZodType<CronRuntimeState>

const failureCode = z.enum([
  'cron_not_found',
  'invalid_expression',
  'invalid_timezone',
  'workspace_context_unavailable',
  'target_session_unavailable',
  'agent_preset_unavailable',
  'model_unavailable',
  'prompt_rejected',
  'persistence_unavailable',
  'internal_error',
] satisfies readonly CronFailureCode[])

/** Strict durable execution history schema. */
export const cronExecutionSchema = z.object({
  id: executionId,
  cronId,
  trigger: z.enum(['on_time', 'startup_catch_up', 'pending_after_run']),
  scheduledFor: timestamp.optional(),
  delayed: z.boolean(),
  coalescedThrough: timestamp.optional(),
  state: z.enum([
    'queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled', 'coalesced',
  ]),
  sessionId: sessionId.optional(),
  sessionRequestId: sessionRequestId.optional(),
  failureCode: failureCode.optional(),
  startedAt: timestamp.optional(),
  finishedAt: timestamp.optional(),
}).strict() as z.ZodType<CronExecution>

/** Plugin-owned storage domain. */
export const cronDomainSpec = defineDomain({
  name: 'dsh_cron',
  version: 1,
  tables: {
    definitions: domainTable<CronId, CronDefinition>(cronDefinitionSchema),
    runtime: domainTable<CronId, CronRuntimeState>(cronRuntimeStateSchema),
    executions: domainTable<CronExecutionId, CronExecution>(cronExecutionSchema),
  },
})
