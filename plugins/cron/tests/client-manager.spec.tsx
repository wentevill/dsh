// @vitest-environment jsdom
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CronManagerController } from '../src/client/controller.ts'
import { CronManager } from '../src/client/manager.tsx'
import { ensureCronStyles } from '../src/client/styles.ts'
import type { CronDefinitionWire } from '../src/remote-types.ts'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => import('./ui-primitives.mock.tsx'))

const SESSION = 'session-1' as SessionId
const ok = <T,>(value: T) => Promise.resolve({ ok: true as const, value })

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function definition(patch: Partial<CronDefinitionWire> = {}): CronDefinitionWire {
  return {
    id: 'cron-1', workspaceId: 'workspace-1', name: '日报', expression: '0 9 * * *',
    timezone: 'Asia/Shanghai', prompt: '生成日报', createdFromSessionId: SESSION,
    executionMode: 'existing_session', targetSessionId: SESSION, state: 'active', revision: 1,
    createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z',
    ...patch,
  } as CronDefinitionWire
}

function remote(items: readonly CronDefinitionWire[] = [definition()]) {
  return {
    list: vi.fn(async () => ({ ok: true as const, value: items })),
    history: vi.fn(async () => ({ ok: true as const, value: {
      items: [{
        id: 'execution-1', cronId: 'cron-1', trigger: 'on_time' as const,
        delayed: false, state: 'succeeded' as const, sessionId: 'execution-session',
      }],
    } })),
    create: vi.fn((request: unknown) => ok(definition({ id: 'cron-new', ...(request as object) }))),
    update: vi.fn(() => ok(definition({ name: '新日报', revision: 2 }))),
    pause: vi.fn(() => ok(definition({ state: 'paused', revision: 2 }))),
    resume: vi.fn(() => ok(definition({ state: 'active', revision: 3 }))),
    delete: vi.fn(() => ok(definition({ state: 'deleted', revision: 2 }))),
  }
}

describe('CronManager', () => {
  it('places the inline bundle manager after the Components section on the plugin page', () => {
    ensureCronStyles()
    render(<div data-plugin-detail="dsh-cron"><div>
      <section data-plugin-config data-testid="cron-config" />
      <section data-plugin-rows data-testid="components" />
    </div></div>)

    expect(getComputedStyle(screen.getByTestId('components')).order).toBe('1')
    expect(getComputedStyle(screen.getByTestId('cron-config')).order).toBe('2')
  })

  it('renders one standard row per task and toggles it through Remote without Agent approval', async () => {
    const api = remote()
    const approvalPrompt = vi.fn()
    render(<CronManager sessionId={SESSION} initial={{ scope: 'related' }} remote={api} sessions={{ open: vi.fn() }} />)

    expect(await screen.findByRole('button', { name: '编辑 日报' })).toBeTruthy()
    expect(screen.getByText('0 9 * * *')).toBeTruthy()
    expect(api.list).toHaveBeenCalledWith({ sessionId: SESSION, scope: 'related' })
    fireEvent.click(screen.getByRole('switch', { name: '启用 日报' }))
    await waitFor(() => expect(api.pause).toHaveBeenCalledWith({ sessionId: SESSION, cronId: 'cron-1' }))
    expect(approvalPrompt).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '全部' })).toBeNull()
    expect(screen.queryByRole('button', { name: '已删除' })).toBeNull()
  })

  it('opens execution Sessions, paginates history, and omits links without a Session id', async () => {
    const api = remote()
    api.history
      .mockResolvedValueOnce({ ok: true, value: { items: [{
        id: 'execution-1', cronId: 'cron-1', trigger: 'on_time', delayed: false,
        state: 'succeeded', sessionId: 'execution-session',
      }], nextCursor: 'next' } } as never)
      .mockResolvedValueOnce({ ok: true, value: { items: [{
        id: 'execution-2', cronId: 'cron-1', trigger: 'pending_after_run', delayed: true,
        state: 'failed',
      }] } } as never)
    const sessions = { open: vi.fn() }
    render(<CronManager sessionId={SESSION} initial={{ scope: 'related' }} remote={api} sessions={sessions} />)

    fireEvent.click(await screen.findByRole('button', { name: '编辑 日报' }))
    const dialog = await screen.findByRole('dialog', { name: '修改「日报」' })
    fireEvent.click(within(dialog).getByRole('button', { name: '打开执行 Session' }))
    await waitFor(() => expect(sessions.open).toHaveBeenCalledWith('execution-session'))
    fireEvent.click(screen.getByRole('button', { name: '更多历史' }))
    await screen.findByText('execution-2')
    expect(api.history).toHaveBeenLastCalledWith({
      sessionId: SESSION, cronId: 'cron-1', cursor: 'next', limit: 50,
    })
    expect(within(dialog).getAllByRole('button', { name: '打开执行 Session' })).toHaveLength(1)
  })

  it('uses the browser timezone explicitly when creating without editing it', async () => {
    const api = remote([])
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' }),
    } as Intl.DateTimeFormat)
    render(<CronManager sessionId={SESSION} initial={{ scope: 'related' }} remote={api} sessions={{ open: vi.fn() }} />)

    fireEvent.click(await screen.findByRole('button', { name: '新建 Cron' }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '晨报' } })
    fireEvent.change(screen.getByLabelText('Cron 表达式'), { target: { value: '0 8 * * *' } })
    fireEvent.change(screen.getByLabelText('任务内容'), { target: { value: '生成晨报' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => expect(api.create).toHaveBeenCalledWith({
      sessionId: SESSION, name: '晨报', expression: '0 8 * * *', timezone: 'Asia/Shanghai',
      prompt: '生成晨报', executionMode: 'existing_session',
    }))
  })

  it('resumes and edits through their exact direct Remote methods', async () => {
    const api = remote([definition({ state: 'paused' })])
    render(<CronManager sessionId={SESSION} initial={{ scope: 'related' }} remote={api} sessions={{ open: vi.fn() }} />)

    fireEvent.click(await screen.findByRole('switch', { name: '启用 日报' }))
    await waitFor(() => expect(api.resume).toHaveBeenCalledWith({ sessionId: SESSION, cronId: 'cron-1' }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑 日报' }))
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '新日报' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(api.update).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: SESSION, cronId: 'cron-1', expectedRevision: 1, name: '新日报',
    })))
  })

  it('uses a wide edit dialog and the official execution-mode menu', async () => {
    const api = remote()
    render(<CronManager sessionId={SESSION} initial={{ scope: 'related' }} remote={api} sessions={{ open: vi.fn() }} />)

    fireEvent.click(await screen.findByRole('button', { name: '编辑 日报' }))
    const dialog = screen.getByRole('dialog', { name: '修改「日报」' })
    expect(getComputedStyle(dialog).maxWidth).toBe('720px')
    const trigger = screen.getByRole('button', { name: '执行模式' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('menuitem', { name: '每次新建 Session' }))
    expect(trigger.textContent).toContain('每次新建 Session')
  })

  it('confirms permanent task deletion from the trailing official-style action', async () => {
    const api = remote()
    render(<CronManager sessionId={SESSION} initial={{ scope: 'related' }} remote={api} sessions={{ open: vi.fn() }} />)

    fireEvent.click(await screen.findByRole('button', { name: '删除 日报' }))
    const dialog = screen.getByRole('dialog', { name: '删除「日报」？' })
    expect(api.delete).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: /^删除$/ }))
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith({ sessionId: SESSION, cronId: 'cron-1' }))
  })

  it('keeps deleted definitions read-only and reports bounded Remote failures', async () => {
    const deletedApi = remote([definition({ state: 'deleted' })])
    render(<CronManager sessionId={SESSION} initial={{ scope: 'deleted' }} remote={deletedApi} sessions={{ open: vi.fn() }} />)
    expect(await screen.findByText('只读')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '恢复' })).toBeNull()

    const failed = remote()
    failed.list.mockResolvedValue({ ok: false, error: { code: 'REMOTE_FAILED', message: 'secret detail' } } as never)
    render(<CronManager sessionId={SESSION} initial={{ scope: 'related' }} remote={failed} sessions={{ open: vi.fn() }} />)
    expect(await screen.findByText('暂时无法加载 Cron')).toBeTruthy()
    expect(screen.queryByText('secret detail')).toBeNull()
  })
})

describe('CronManagerController', () => {
  it('discards a stale list response that resolves after a newer scope', async () => {
    let resolveOld!: (value: unknown) => void
    const old = new Promise(resolve => { resolveOld = resolve })
    const api = remote()
    api.list
      .mockImplementationOnce(() => old as never)
      .mockResolvedValueOnce({ ok: true, value: [definition({ id: 'newer', name: '新值' })] })
    const controller = new CronManagerController(SESSION, api)

    const first = controller.load('related')
    await controller.load('all')
    resolveOld({ ok: true, value: [definition({ id: 'older', name: '旧值' })] })
    await first

    expect(controller.getSnapshot().scope).toBe('all')
    expect(controller.getSnapshot().items.map(item => item.id)).toEqual(['newer'])
  })
})
