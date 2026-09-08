// @vitest-environment jsdom
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CronManagerToolRow } from '../src/client/suggestion-row.tsx'

const SESSION = 'session-1' as SessionId

afterEach(cleanup)

function remote() {
  return {
    list: vi.fn(async () => ({ ok: true as const, value: [] })),
    history: vi.fn(), create: vi.fn(), update: vi.fn(), pause: vi.fn(),
    resume: vi.fn(), delete: vi.fn(),
  }
}

function settled(text: string) {
  return {
    kind: 'tool-result' as const, seq: 2, time: 2, callId: 'call-1',
    call: { name: 'cron_open_manager', argsRaw: '{}' }, callTime: 1,
    content: [{ type: 'text' as const, text }], isError: false, subCalls: [],
  }
}

describe('CronManagerToolRow', () => {
  it('stays compact without Remote work, expands in the same row, and preserves loaded state', async () => {
    const api = remote()
    const props = {
      callId: 'call-1', toolName: 'cron_open_manager', sessionId: SESSION,
      block: settled(JSON.stringify({ kind: 'cron-manager-suggestion', scope: 'related', sessionId: SESSION })),
      remote: api, sessions: { open: vi.fn() },
    }
    render(<CronManagerToolRow {...props} />)

    expect(screen.getByRole('button', { name: '管理 Cron' })).toBeTruthy()
    expect(api.list).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '管理 Cron' }))
    expect(await screen.findByRole('region', { name: 'Cron 管理器' })).toBeTruthy()
    expect(api.list).toHaveBeenCalledWith({ sessionId: SESSION, scope: 'related' })
    fireEvent.click(screen.getByRole('button', { name: '收起' }))
    expect(screen.getByRole('button', { name: '管理 Cron' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '管理 Cron' }))
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1))
  })

  it('renders bounded loading and unavailable rows for claimed-slot edge cases', () => {
    const api = remote()
    const { rerender } = render(<CronManagerToolRow
      callId="call-1" toolName="cron_open_manager" sessionId={SESSION}
      block={{ callId: 'call-1', name: 'cron_open_manager', argsRaw: '{}', turn: 1, step: 1, time: 1, subCalls: [] }}
      remote={api} sessions={{ open: vi.fn() }}
    />)
    expect(screen.getByText('正在准备 Cron 管理器…')).toBeTruthy()

    rerender(<CronManagerToolRow
      callId="call-1" toolName="cron_open_manager" sessionId={SESSION}
      block={settled('{malformed')}
      remote={api} sessions={{ open: vi.fn() }}
    />)
    expect(screen.getByText('Cron 管理器暂不可用')).toBeTruthy()
    expect(api.list).not.toHaveBeenCalled()
  })
})
