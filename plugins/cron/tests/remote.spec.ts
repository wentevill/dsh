import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { CronId } from '../src/brand.ts'

vi.mock('@deepseek-ai/dsh-typert-protocol', () => ({
  Remote: () => () => undefined,
  TypertRemoteService: class { constructor(_ctx: Context, _name: string) {} },
}))

const SESSION = 'session-1' as SessionId
const CRON = CronId('cron-1')

describe('CronRemote', () => {
  let CronRemote: typeof import('../lib/remote.js').CronRemote

  beforeAll(async () => { ({ CronRemote } = await import('../lib/remote.js')) })

  it('forwards the invoking Session on every exact method', async () => {
    const commands = {
      list: vi.fn(async () => []), history: vi.fn(() => ({ items: [] })),
      create: vi.fn(async () => ({ id: CRON })), update: vi.fn(async () => ({ id: CRON })),
      pause: vi.fn(async () => ({ id: CRON })), resume: vi.fn(async () => ({ id: CRON })),
      delete: vi.fn(async () => ({ id: CRON })),
    }
    const remote = new CronRemote({} as Context, commands as never)
    const create = {
      sessionId: SESSION, name: 'daily', expression: '0 9 * * *', timezone: 'UTC',
      prompt: 'report', executionMode: 'existing_session' as const,
    }
    const update = { sessionId: SESSION, cronId: CRON, expectedRevision: 2, name: 'renamed' }

    await remote.list({ sessionId: SESSION, scope: 'related' })
    await remote.history({ sessionId: SESSION, cronId: CRON, cursor: 'cursor', limit: 20 })
    await remote.create(create)
    await remote.update(update)
    await remote.pause({ sessionId: SESSION, cronId: CRON })
    await remote.resume({ sessionId: SESSION, cronId: CRON })
    await remote.delete({ sessionId: SESSION, cronId: CRON })

    expect(commands.list).toHaveBeenCalledWith(SESSION, 'related')
    expect(commands.history).toHaveBeenCalledWith(SESSION, CRON, { cursor: 'cursor', limit: 20 })
    expect(commands.create).toHaveBeenCalledWith(SESSION, {
      name: 'daily', expression: '0 9 * * *', timezone: 'UTC', prompt: 'report',
      executionMode: 'existing_session',
    })
    expect(commands.update).toHaveBeenCalledWith(SESSION, CRON, 2, { name: 'renamed' })
    expect(commands.pause).toHaveBeenCalledWith(SESSION, CRON)
    expect(commands.resume).toHaveBeenCalledWith(SESSION, CRON)
    expect(commands.delete).toHaveBeenCalledWith(SESSION, CRON)
  })

  it('contains no generic mutate entry point', () => {
    const names = Object.getOwnPropertyNames(CronRemote.prototype)
    expect(names.filter(name => name !== 'constructor')).toEqual([
      'list', 'history', 'create', 'update', 'pause', 'resume', 'delete',
    ])
  })

  it('generates exactly seven plain-string Remote wire methods', () => {
    const generated = readFileSync(new URL('../lib/typert.remote-client.js', import.meta.url), 'utf8')
    const methods = [...generated.matchAll(/method: '([^']+)'/gu)].map(match => match[1])
    expect(methods).toEqual(['create', 'delete', 'history', 'list', 'pause', 'resume', 'update'])
    expect(generated).not.toContain('__brand')
    expect(generated).not.toContain("method: 'mutate'")
  })
})
