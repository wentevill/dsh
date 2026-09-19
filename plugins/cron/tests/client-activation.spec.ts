// @vitest-environment jsdom
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => import('./ui-primitives.mock.tsx'))
import { apply } from '../src/client/index.tsx'

afterEach(cleanup)

describe('Cron Client activation', () => {
  it('mounts Remote and registers both the tool row and inline bundle manager before disposal', async () => {
    const order: string[] = []
    const registrations: Array<Record<string, unknown>> = []
    const components = new Map<string, React.ComponentType<Record<string, unknown>>>()
    const cron = {
      list: vi.fn(async () => ({ ok: true as const, value: [{
        id: 'cron-1', workspaceId: 'workspace-1', name: '日报', expression: '0 9 * * *',
        timezone: 'Asia/Shanghai', prompt: '生成日报', createdFromSessionId: 'session-1',
        executionMode: 'existing_session', targetSessionId: 'session-1', state: 'active', revision: 1,
        createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z',
      }] })),
      history: vi.fn(async () => ({ ok: true as const, value: { items: [] } })),
      create: vi.fn(), update: vi.fn(), pause: vi.fn(), resume: vi.fn(), delete: vi.fn(),
    }
    const child = {
      remote: { cron }, sessions: { open: vi.fn() },
      locale: { register: vi.fn(() => () => { order.push('locale:dispose') }) },
      effect(register: () => () => void) { register() },
      slots: {
        inject(name: string, register: () => unknown) {
          order.push(`inject:${name}`)
          expect(register()).toBeTypeOf('function')
        },
        register(options: Record<string, unknown>, component: React.ComponentType<Record<string, unknown>>) {
          registrations.push(options)
          components.set(String(options.name), component)
          return () => { order.push(`slot:dispose:${String(options.name)}`) }
        },
      },
    }
    const feature = Object.assign(Promise.resolve(), {
      dispose: async () => { order.push('child:dispose') },
    })
    const ctx = {
      remote: { $mount: vi.fn(async () => () => { order.push('remote:dispose') }) },
      plugin: vi.fn((plugin: (context: typeof child) => unknown) => {
        plugin(child)
        return feature
      }),
    }

    const dispose = await apply(ctx as never)
    expect(registrations).toEqual([
      { name: 'tool.call.toolview', key: 'cron_open_manager', locale: 'cron' },
      { name: 'plugins.bundle.config', key: 'dsh-cron', locale: 'cron' },
    ])
    expect(registrations.flatMap(value => Object.values(value))).not.toContain('details')
    expect(registrations.flatMap(value => Object.values(value))).not.toContain('conversation.details.tool')
    expect(registrations.flatMap(value => Object.values(value))).not.toContain('conversation.view')

    const BundleManager = components.get('plugins.bundle.config')!
    const sessionId = 'session-1' as SessionId
    const page = render(React.createElement(BundleManager, {
      view: 'page',
      t: (key: string) => ({ manager: 'Cron 管理器', noCurrentSession: '请先打开一个 Workspace 会话' }[key] ?? key),
      useSessions: (select: (state: unknown) => unknown) => select({
        ids: [sessionId],
        byId: { [sessionId]: { id: sessionId } }, current: sessionId,
        phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
      }),
    }))
    expect(await screen.findByRole('region', { name: 'Cron 管理器' })).toBeTruthy()
    await waitFor(() => expect(cron.list).toHaveBeenCalledWith({ sessionId, scope: 'all' }))

    const secondSessionId = 'session-2' as SessionId
    page.rerender(React.createElement(BundleManager, {
      view: 'page',
      t: (key: string) => ({ manager: 'Cron 管理器', noCurrentSession: '请先打开一个 Workspace 会话' }[key] ?? key),
      useSessions: (select: (state: unknown) => unknown) => select({
        ids: [secondSessionId], byId: { [secondSessionId]: { id: secondSessionId } }, current: secondSessionId,
        phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
      }),
    }))
    await waitFor(() => expect(cron.list).toHaveBeenCalledWith({ sessionId: secondSessionId, scope: 'all' }))

    page.rerender(React.createElement(BundleManager, {
      view: 'page',
      t: (key: string) => ({ manager: 'Cron 管理器', noCurrentSession: '请先打开一个 Workspace 会话' }[key] ?? key),
      useSessions: (select: (state: unknown) => unknown) => select({
        ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {},
        jobsBySession: {}, currentAddress: undefined,
      }),
    }))
    expect(screen.getByText('请先打开一个 Workspace 会话')).toBeTruthy()
    expect(cron.list).toHaveBeenCalledTimes(2)

    await dispose()
    expect(order.slice(-2)).toEqual(['child:dispose', 'remote:dispose'])
  })
})
