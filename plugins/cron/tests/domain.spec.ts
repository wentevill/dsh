import { describe, expect, it } from 'vitest'
import {
  cronDefinitionSchema,
  cronExecutionSchema,
  cronRuntimeStateSchema,
} from '../src/domain.ts'

const timestamp = '2026-09-07T00:00:00.000Z'

describe('Cron durable schemas', () => {
  it('accepts a fixed-Session definition with only its fixed target', () => {
    const definition = cronDefinitionSchema.parse({
      id: 'cron-1', workspaceId: 'workspace-1', name: '日报',
      expression: '0 9 * * 1-5', timezone: 'Asia/Shanghai', prompt: '生成日报',
      executionMode: 'existing_session', createdFromSessionId: 'session-1',
      targetSessionId: 'session-1', state: 'active', revision: 1,
      createdAt: timestamp, updatedAt: timestamp,
    })

    expect(definition).toMatchObject({
      executionMode: 'existing_session', targetSessionId: 'session-1',
    })
    expect(definition).not.toHaveProperty('agentPresetId')
  })

  it('rejects a fresh-Session definition without an Agent preset', () => {
    expect(() => cronDefinitionSchema.parse({
      id: 'cron-2', workspaceId: 'workspace-1', name: '日报',
      expression: '0 9 * * *', timezone: 'UTC', prompt: '生成日报',
      executionMode: 'new_session', createdFromSessionId: 'session-1',
      state: 'active', revision: 1, createdAt: timestamp, updatedAt: timestamp,
    })).toThrow()
  })

  it('rejects mode targets that belong to the other execution mode', () => {
    expect(() => cronDefinitionSchema.parse({
      id: 'cron-3', workspaceId: 'workspace-1', name: '日报',
      expression: '0 9 * * *', timezone: 'UTC', prompt: '生成日报',
      executionMode: 'existing_session', createdFromSessionId: 'session-1',
      targetSessionId: 'session-1', agentPresetId: 'standard', state: 'active',
      revision: 1, createdAt: timestamp, updatedAt: timestamp,
    })).toThrow()
  })

  it('keeps a library checkpoint in runtime state rather than the definition', () => {
    const runtime = cronRuntimeStateSchema.parse({
      cronId: 'cron-1', libraryNextRunAt: '2026-09-08T01:00:00.000Z',
      observedAt: timestamp,
    })

    expect(runtime.libraryNextRunAt).toBe('2026-09-08T01:00:00.000Z')
  })

  it('keeps delayed timing separate from terminal outcome', () => {
    const execution = cronExecutionSchema.parse({
      id: 'execution-1', cronId: 'cron-1', trigger: 'startup_catch_up',
      scheduledFor: '2026-09-07T01:00:00.000Z', delayed: true,
      coalescedThrough: '2026-09-07T03:00:00.000Z', state: 'queued',
    })

    expect(execution.delayed).toBe(true)
    expect(execution.state).toBe('queued')
  })
})
