import type { InboundEnvelope, NormalizedInboundBlock } from './channel-types.js'

export type InboundMessageErrorCode =
  | 'invalid'
  | 'unsupported'
  | 'too_large'
  | 'timeout'
  | 'aborted'

export class InboundMessageError extends Error {
  constructor(readonly code: InboundMessageErrorCode) {
    super(messageFor(code))
    this.name = 'InboundMessageError'
  }
}

function messageFor(code: InboundMessageErrorCode) {
  switch (code) {
    case 'invalid': return 'Invalid WeCom callback'
    case 'unsupported': return 'Unsupported WeCom message type'
    case 'too_large': return 'WeCom attachment exceeds configured limits'
    case 'timeout': return 'WeCom attachment download timed out'
    case 'aborted': return 'WeCom message handling was cancelled'
  }
}

interface Limits {
  readonly maxAttachmentBytes: number
  readonly maxTotalBytes: number
  readonly downloadTimeoutMs: number
}

interface NormalizeOptions {
  readonly download: (url: string, aesKey?: string) => Promise<{ buffer: Uint8Array; filename?: string }>
  readonly limits?: Partial<Limits>
  readonly signal?: AbortSignal
}

interface RawFrame {
  readonly headers?: { readonly req_id?: unknown }
  readonly body?: Record<string, unknown>
}

const defaults: Limits = {
  maxAttachmentBytes: 10 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  downloadTimeoutMs: 15_000,
}

export async function normalizeInbound(
  input: unknown,
  options: NormalizeOptions,
): Promise<InboundEnvelope> {
  const frame = asFrame(input)
  const body = frame.body!
  const requestId = requiredString(frame.headers?.req_id)
  const messageId = requiredString(body.msgid)
  const botId = requiredString(body.aibotid)
  const sender = asRecord(body.from)
  const senderId = requiredString(sender?.userid)
  const chatType = requiredString(body.chattype)
  const room = chatType === 'single'
    ? { kind: 'direct' as const, id: senderId }
    : chatType === 'group'
      ? { kind: 'group' as const, id: requiredString(body.chatid) }
      : fail('invalid')
  const limits = { ...defaults, ...options.limits }
  const state = { totalBytes: 0 }
  const content = await normalizeContent(body, options, limits, state)
  return { requestId, messageId, botId, room, senderId, content, replyContext: input }
}

async function normalizeContent(
  body: Record<string, unknown>,
  options: NormalizeOptions,
  limits: Limits,
  state: { totalBytes: number },
): Promise<readonly NormalizedInboundBlock[]> {
  const type = requiredString(body.msgtype)
  if (type === 'text' || type === 'voice') {
    const content = requiredString(asRecord(body[type])?.content)
    return [{ type: 'text', text: content }]
  }
  if (type === 'image' || type === 'file') {
    return [await downloadBlock(type, asRecord(body[type]), options, limits, state)]
  }
  if (type === 'mixed') {
    const items = asRecord(body.mixed)?.msg_item
    if (!Array.isArray(items) || items.length === 0) fail('invalid')
    const blocks: NormalizedInboundBlock[] = []
    for (const item of items) {
      const record = asRecord(item)
      const itemType = requiredString(record?.msgtype)
      if (itemType === 'text') {
        blocks.push({ type: 'text', text: requiredString(asRecord(record?.text)?.content) })
      } else if (itemType === 'image') {
        blocks.push(await downloadBlock('image', asRecord(record?.image), options, limits, state))
      } else {
        fail('unsupported')
      }
    }
    return blocks
  }
  fail('unsupported')
}

async function downloadBlock(
  mediaType: 'image' | 'file',
  media: Record<string, unknown> | undefined,
  options: NormalizeOptions,
  limits: Limits,
  state: { totalBytes: number },
): Promise<NormalizedInboundBlock> {
  const url = requiredString(media?.url)
  const aesKey = optionalString(media?.aeskey)
  const result = await boundedDownload(() => options.download(url, aesKey), limits.downloadTimeoutMs, options.signal)
  const bytes = new Uint8Array(result.buffer)
  if (bytes.byteLength > limits.maxAttachmentBytes) fail('too_large')
  state.totalBytes += bytes.byteLength
  if (state.totalBytes > limits.maxTotalBytes) fail('too_large')
  return { type: 'attachment', mediaType, bytes, filename: result.filename }
}

async function boundedDownload<T>(start: () => Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) fail('aborted')
  let timer: ReturnType<typeof setTimeout> | undefined
  let abortListener: (() => void) | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new InboundMessageError('timeout')), timeoutMs)
  })
  const aborted = new Promise<never>((_, reject) => {
    if (!signal) return
    abortListener = () => reject(new InboundMessageError('aborted'))
    signal.addEventListener('abort', abortListener, { once: true })
  })
  try {
    return await Promise.race([start(), timeout, aborted])
  } finally {
    if (timer) clearTimeout(timer)
    if (signal && abortListener) signal.removeEventListener('abort', abortListener)
  }
}

function asFrame(value: unknown): RawFrame {
  const record = asRecord(value)
  if (!record || !asRecord(record.headers) || !asRecord(record.body)) fail('invalid')
  return record as RawFrame
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) fail('invalid')
  return value
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined
  return requiredString(value)
}

function fail(code: InboundMessageErrorCode): never {
  throw new InboundMessageError(code)
}
