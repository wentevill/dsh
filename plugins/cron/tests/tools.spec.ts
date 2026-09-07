import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { describe, expect, it, vi } from 'vitest'
import { CronExecutionId, CronId } from '../src/brand.ts'
import { cronFailure } from '../src/errors.ts'
import { createCronTools } from '../src/tools.ts'

const SESSION = 'session-1' as SessionId

function exec(events: readonly unknown[] = []): ToolRunContext {
  return {
    agent: { session: { id: SESSION, events } },
    signal: new AbortController().signal,
  } as unknown as ToolRunContext
}

function rpcZone(zone: string) {
  return {
    type: 'user/message', seq: 1, time: 1,
    data: {
      id: 'message', role: 'user', content: [],
      source: { kind: 'user', rpcId: 'request', clientTimeZone: zone },
    },
  }
}

function harness() {
  const definition = {
    id: CronId('cron-1'), workspaceId: 'secret-workspace', name: '日报',
    expression: '0 9 * * *', timezone: 'Asia/Shanghai', prompt: 'secret prompt',
    executionMode: 'existing_session', createdFromSessionId: SESSION,
    targetSessionId: SESSION, state: 'active', revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  } as const
  const commands = {
    create: vi.fn(async (_session: SessionId, input: { expression: string }) => {
      if (input.expression.trim().split(/\s+/u).length !== 5) throw cronFailure('invalid_expression')
      return definition
    }),
    update: vi.fn(async () => definition),
    pause: vi.fn(async () => ({ ...definition, state: 'paused' as const })),
    resume: vi.fn(async () => definition),
    delete: vi.fn(async () => ({ ...definition, state: 'deleted' as const })),
    list: vi.fn(async () => [definition]),
    history: vi.fn(() => ({
      items: [{
        id: CronExecutionId('execution-1'), cronId: definition.id, trigger: 'on_time',
        delayed: false, state: 'succeeded', sessionId: SESSION,
        sessionRequestId: 'secret-request', finishedAt: '2026-09-07T01:00:00.000Z',
      }],
      nextCursor: 'opaque',
    })),
  }
  const tools = createCronTools(commands as never)
  const byName = (name: string) => tools.find(tool => tool.name === name)!
  return { byName, commands, tools }
}

describe('createCronTools', () => {
  it('defines exactly eight strict Cron tools without ownership fields', () => {
    const { tools } = harness()
    expect(tools.map(tool => tool.name).sort()).toEqual([
      'cron_create', 'cron_delete', 'cron_history', 'cron_list',
      'cron_open_manager', 'cron_pause', 'cron_resume', 'cron_update',
    ])
    for (const tool of tools) {
      expect(tool.parameters).toMatchObject({ type: 'object', additionalProperties: false })
      const schema = JSON.stringify(tool.parameters)
      expect(schema).not.toContain('workspaceId')
      expect(schema).not.toContain('targetSessionId')
      expect(schema).not.toContain('agentPresetId')
    }
  })

  it('derives an omitted create timezone only from the current browser turn', async () => {
    const { byName, commands } = harness()
    const tool = byName('cron_create')
    const args = {
      name: '日报', expression: '0 9 * * *', prompt: '生成日报', executionMode: 'existing_session',
    }
    await expect(tool.execute(args, exec([rpcZone('Asia/Shanghai')]))).resolves.toMatchObject({ ok: true })
    expect(commands.create).toHaveBeenCalledWith(SESSION, { ...args, timezone: 'Asia/Shanghai' })

    await expect(tool.execute(args, exec([]))).resolves.toEqual({
      ok: false, error: { code: 'invalid_timezone' },
    })
  })

  it('rejects six-field expressions and over-limit pages with bounded failures', async () => {
    const { byName, commands } = harness()
    await expect(byName('cron_create').execute({
      name: '日报', expression: '0 0 9 * * *', timezone: 'UTC',
      prompt: '生成日报', executionMode: 'existing_session',
    }, exec())).resolves.toEqual({ ok: false, error: { code: 'invalid_expression' } })
    await expect(byName('cron_list').execute({ scope: 'all', limit: 101 }, exec()))
      .resolves.toEqual({ ok: false, error: { code: 'invalid_request' } })
    expect(commands.list).not.toHaveBeenCalled()
  })

  it('rejects undeclared ownership arguments before command dispatch', async () => {
    const { byName, commands } = harness()
    await expect(byName('cron_pause').execute({
      cronId: 'cron-1', workspaceId: 'attacker',
    }, exec())).rejects.toThrow()
    expect(commands.pause).not.toHaveBeenCalled()
  })

  it('serializes definitions and history without prompt or Session correlation fields', async () => {
    const { byName } = harness()
    const listed = await byName('cron_list').execute({ scope: 'all' }, exec())
    const history = await byName('cron_history').execute({ cronId: 'cron-1' }, exec())
    const serialized = JSON.stringify({ listed, history })
    expect(serialized).not.toContain('secret prompt')
    expect(serialized).not.toContain('secret-workspace')
    expect(serialized).not.toContain('session-1')
    expect(serialized).not.toContain('secret-request')
    expect(history).toMatchObject({ ok: true, nextCursor: 'opaque' })
  })

  it('returns only the manager suggestion payload', async () => {
    const { byName } = harness()
    await expect(byName('cron_open_manager').execute({}, exec())).resolves.toEqual({
      kind: 'cron-manager-suggestion', scope: 'related', sessionId: SESSION,
    })
  })
})
