import { describe, expect, it, vi } from 'vitest'
import { InboundMessageError, normalizeInbound } from '../src/message-normalizer.js'

function frame(body: Record<string, unknown>) {
  return { headers: { req_id: 'request-secret' }, body: {
    msgid: 'message-secret', aibotid: 'bot-secret', chattype: 'single',
    from: { userid: 'sender-secret' }, ...body,
  } }
}

describe('normalizeInbound', () => {
  it('derives direct and group rooms while preserving callback context', async () => {
    const direct = frame({ msgtype: 'text', text: { content: 'hello' } })
    const group = frame({ chattype: 'group', chatid: 'group-secret', msgtype: 'voice', voice: { content: 'spoken' } })
    const download = vi.fn()
    expect(await normalizeInbound(direct, { download })).toMatchObject({
      room: { kind: 'direct', id: 'sender-secret' }, content: [{ type: 'text', text: 'hello' }], replyContext: direct,
    })
    expect(await normalizeInbound(group, { download })).toMatchObject({
      room: { kind: 'group', id: 'group-secret' }, content: [{ type: 'text', text: 'spoken' }], replyContext: group,
    })
  })

  it('keeps mixed text/image order and downloads attachments', async () => {
    const input = frame({ msgtype: 'mixed', mixed: { msg_item: [
      { msgtype: 'text', text: { content: 'before' } },
      { msgtype: 'image', image: { url: 'https://private.invalid/a', aeskey: 'private-aes' } },
      { msgtype: 'text', text: { content: 'after' } },
    ] } })
    const download = vi.fn(async () => ({ buffer: new Uint8Array([1, 2]), filename: 'a.png' }))
    expect((await normalizeInbound(input, { download })).content).toEqual([
      { type: 'text', text: 'before' },
      { type: 'attachment', mediaType: 'image', bytes: new Uint8Array([1, 2]), filename: 'a.png' },
      { type: 'text', text: 'after' },
    ])
    expect(download).toHaveBeenCalledWith('https://private.invalid/a', 'private-aes')
  })

  it.each([
    [{ chattype: 'group', msgtype: 'text', text: { content: 'x' } }, 'invalid'],
    [{ from: {}, msgtype: 'text', text: { content: 'x' } }, 'invalid'],
    [{ msgtype: 'video', video: { url: 'private' } }, 'unsupported'],
  ])('rejects malformed or unsupported callbacks safely', async (body, code) => {
    const error = await normalizeInbound(frame(body), { download: vi.fn() }).catch(value => value)
    expect(error).toBeInstanceOf(InboundMessageError)
    expect(error).toMatchObject({ code })
    expect(error.message).not.toMatch(/secret|private/i)
  })

  it('enforces individual and total byte limits', async () => {
    const input = frame({ msgtype: 'file', file: { url: 'https://private.invalid/file', aeskey: 'private' } })
    const error = await normalizeInbound(input, {
      download: async () => ({ buffer: new Uint8Array(5) }),
      limits: { maxAttachmentBytes: 4, maxTotalBytes: 4 },
    }).catch(value => value)
    expect(error).toMatchObject({ code: 'too_large' })
    expect(error.message).not.toMatch(/private/i)
  })

  it('bounds downloads by timeout and caller abort', async () => {
    vi.useFakeTimers()
    const input = frame({ msgtype: 'image', image: { url: 'https://private.invalid/image' } })
    const pending = () => new Promise<never>(() => {})
    const timeout = normalizeInbound(input, { download: pending, limits: { downloadTimeoutMs: 10 } })
    const timeoutAssertion = expect(timeout).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(10)
    await timeoutAssertion

    const abort = new AbortController()
    const aborted = normalizeInbound(input, { download: pending, signal: abort.signal })
    abort.abort()
    await expect(aborted).rejects.toMatchObject({ code: 'aborted' })
    expect(vi.getTimerCount()).toBe(0)
  })
})
