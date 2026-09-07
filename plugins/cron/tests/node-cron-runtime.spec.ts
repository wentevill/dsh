import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CronId } from '../src/brand.ts'
import { CronLibrary } from '../src/node-cron-runtime.ts'
import type { CronDefinition } from '../src/types.ts'

function definition(expression: string, timezone = 'UTC'): CronDefinition {
  return {
    id: CronId('cron-1'), workspaceId: 'workspace-1' as WorkspaceId, name: '测试任务',
    expression, timezone, prompt: '执行任务', executionMode: 'existing_session',
    createdFromSessionId: 'session-1' as SessionId,
    targetSessionId: 'session-1' as SessionId, state: 'active', revision: 1,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('CronLibrary', () => {
  it.each(['* * * * *', '0,30 9 * * *', '0 9-17 * * *', '*/15 * * * *'])(
    'accepts standard five-field expression %s',
    (expression) => {
      expect(new CronLibrary().validate({ expression, timezone: 'Asia/Shanghai' }))
        .toEqual({ ok: true })
    },
  )

  it('rejects six-field expressions, macros, invalid fields, and invalid IANA zones', () => {
    const library = new CronLibrary()
    expect(library.validate({ expression: '0 0 9 * * *', timezone: 'UTC' }))
      .toEqual({ ok: false, code: 'invalid_expression' })
    expect(library.validate({ expression: '@daily', timezone: 'UTC' }))
      .toEqual({ ok: false, code: 'invalid_expression' })
    expect(library.validate({ expression: '90 9 * * *', timezone: 'UTC' }))
      .toEqual({ ok: false, code: 'invalid_expression' })
    expect(library.validate({ expression: '0 9 * * *', timezone: 'No/Such_Zone' }))
      .toEqual({ ok: false, code: 'invalid_timezone' })
  })

  it('uses node-cron DOM-and-DOW matching when both fields are restricted', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T00:00:00.000Z'))
    const live = new CronLibrary().start(definition('0 9 7 * 1'), async () => {})

    expect(live.nextRunAt()?.toISOString()).toBe('2026-12-07T09:00:00.000Z')
    await live.destroy()
  })

  it('lets node-cron skip a nonexistent DST spring-forward wall time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-08T06:59:00.000Z'))
    const live = new CronLibrary().start(
      definition('30 2 * * *', 'America/New_York'),
      async () => {},
    )

    expect(live.nextRunAt()?.toISOString()).toBe('2026-03-09T06:30:00.000Z')
    await live.destroy()
  })

  it('uses the first repeated DST fall-back wall time selected by node-cron', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T04:59:00.000Z'))
    const live = new CronLibrary().start(
      definition('30 1 * * *', 'America/New_York'),
      async () => {},
    )

    expect(live.nextRunAt()?.toISOString()).toBe('2026-11-01T05:30:00.000Z')
    await live.destroy()
  })

  it('delivers TaskContext.date as scheduledFor and delegates lifecycle controls', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T08:59:59.000Z'))
    const occurrences: Date[] = []
    const live = new CronLibrary().start(definition('* * * * *'), async (scheduledFor) => {
      occurrences.push(scheduledFor)
    })

    expect(live.nextRunAt()?.toISOString()).toBe('2026-09-07T09:00:00.000Z')
    await vi.advanceTimersByTimeAsync(1_100)
    expect(occurrences.map(value => value.toISOString())).toEqual(['2026-09-07T09:00:00.000Z'])

    await live.stop()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(occurrences).toHaveLength(1)
    await live.start()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(occurrences).toHaveLength(2)
    await live.destroy()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(occurrences).toHaveLength(2)
  })
})
