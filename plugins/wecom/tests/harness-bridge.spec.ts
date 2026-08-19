import { describe, expect, it, vi } from 'vitest'
import { HarnessBridge, HarnessBridgeError } from '../src/harness-bridge.js'
import { RoomScheduler } from '../src/room-scheduler.js'

function envelope() {
  return {
    requestId: 'req-1', messageId: 'msg-1', botId: 'bot-1',
    room: { kind: 'group' as const, id: 'room-1' }, senderId: 'user-1',
    content: [{ type: 'text' as const, text: 'question' }],
    replyContext: { headers: { req_id: 'req-1' } },
  }
}

function setup(reason: Record<string, unknown> = { kind: 'completed' }) {
  const session = { seq: 2, events: [] as any[] }
  const agent = {
    session,
    followup: vi.fn((message) => {
      session.events.push({ seq: 2, type: 'turn/start', data: {} })
      session.events.push({ seq: 3, type: 'assistant/message', data: { message: {
        content: [{ type: 'text', text: 'answer' }],
      } } })
      session.events.push({ seq: 4, type: 'turn/end', data: { reason } })
      session.seq = 5
    }),
    whenIdle: vi.fn(async () => {}),
  }
  const dispose = vi.fn(async () => {})
  const runtime = {
    agentFor: vi.fn(async () => ({ agent, dispose })),
    materializeContent: vi.fn(async (blocks) => blocks),
    flush: vi.fn(async () => {}),
  }
  const roomSessions = { resolve: vi.fn(async () => 'session-1') }
  const reply = vi.fn(async () => {})
  const bridge = new HarnessBridge({
    scheduler: new RoomScheduler({ concurrency: 2, perRoomCapacity: 4 }),
    roomSessions: roomSessions as never,
    runtime: runtime as never,
    reply,
    createStreamId: () => 'stream-1',
  })
  return { bridge, runtime, roomSessions, reply, agent, dispose }
}

describe('HarnessBridge', () => {
  it('resolves one room session, drives one turn, flushes, and references the callback', async () => {
    const { bridge, runtime, roomSessions, reply, agent } = setup()
    const input = envelope()
    await bridge.handle(input, new AbortController().signal)

    expect(roomSessions.resolve).toHaveBeenCalledWith({ botId: 'bot-1', kind: 'group', id: 'room-1' })
    expect(runtime.agentFor).toHaveBeenCalledWith('session-1', expect.any(AbortSignal))
    expect(agent.followup).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user', content: [{ type: 'text', text: 'question' }], source: { kind: 'user' },
    }))
    expect(runtime.flush).toHaveBeenCalledWith(agent.session)
    expect(reply).toHaveBeenCalledWith(input.replyContext, 'stream-1', 'answer', true)
  })

  it('rejects failed and empty turns without replying', async () => {
    const failed = setup({ kind: 'error', error: { code: 'failed', message: 'private' } })
    await expect(failed.bridge.handle(envelope(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'turn-failed' })
    expect(failed.reply).not.toHaveBeenCalled()

    const empty = setup()
    empty.agent.followup.mockImplementation((() => {
      empty.agent.session.events.push({ seq: 2, type: 'turn/start', data: {} })
      empty.agent.session.events.push({ seq: 3, type: 'turn/end', data: { reason: { kind: 'completed' } } })
    }) as never)
    await expect(empty.bridge.handle(envelope(), new AbortController().signal))
      .rejects.toMatchObject({ code: 'empty-response' })
    expect(empty.reply).not.toHaveBeenCalled()
  })

  it('does not reply after abort and disposes only owned handles', async () => {
    const { bridge, runtime, reply, dispose } = setup()
    const abort = new AbortController()
    runtime.flush.mockImplementationOnce(async () => { abort.abort() })
    await expect(bridge.handle(envelope(), abort.signal)).rejects.toMatchObject({ code: 'aborted' })
    expect(reply).not.toHaveBeenCalled()
    await bridge.dispose()
    await bridge.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('surfaces reply acknowledgement failures safely', async () => {
    const { bridge, reply } = setup()
    reply.mockRejectedValueOnce(new Error('transport details'))
    await expect(bridge.handle(envelope(), new AbortController().signal))
      .rejects.toBeInstanceOf(HarnessBridgeError)
  })
})
