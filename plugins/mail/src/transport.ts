import { ImapFlow, type FetchMessageObject, type MessageAddressObject, type MessageStructureObject } from 'imapflow'
import { MailParser, type AttachmentStream, type MessageText } from 'mailparser'
import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import type { MailAddress, MailAttachmentMetadata, MailListRequest, MailListResult, MailMessageSummary, MailReadRequest, MailReadResult, MailSendRequest, MailSendResult } from '@deepseek-ai/dsh-mail'
import type { MailTransport, ResolvedConfig } from './index.ts'

/** Safety cap on a single fetched message source, in bytes. */
const MAX_SOURCE_BYTES = 2_000_000

function addresses(values: readonly MessageAddressObject[] | undefined): MailAddress[] {
  return (values ?? []).flatMap(value => value.address === undefined ? [] : [{
    address: value.address,
    ...(value.name === undefined ? {} : { name: value.name }),
  }])
}

function hasAttachments(node: MessageStructureObject | undefined): boolean {
  if (node === undefined) return false
  if (node.disposition?.toLowerCase() === 'attachment') return true
  return (node.childNodes ?? []).some(hasAttachments)
}

function summary(message: FetchMessageObject): MailMessageSummary {
  const envelope = message.envelope
  return {
    id: String(message.uid),
    from: addresses(envelope?.from),
    to: addresses(envelope?.to),
    ...(envelope?.cc === undefined ? {} : { cc: addresses(envelope.cc) }),
    subject: envelope?.subject ?? '',
    receivedAt: new Date(envelope?.date ?? message.internalDate ?? 0).toISOString(),
    hasAttachments: hasAttachments(message.bodyStructure),
  }
}

function assertNotAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}

async function withImap<T>(
  config: ResolvedConfig,
  password: string,
  signal: AbortSignal | undefined,
  operation: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  assertNotAborted(signal)
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: config.username, pass: password },
    logger: false,
    emitLogs: false,
    logRaw: false,
    maxLiteralSize: MAX_SOURCE_BYTES,
    maxResponseSize: MAX_SOURCE_BYTES + 64_000,
  })
  const abort = () => client.close()
  signal?.addEventListener('abort', abort, { once: true })
  try {
    await client.connect()
    return await operation(client)
  } finally {
    signal?.removeEventListener('abort', abort)
    await client.logout().catch(() => undefined)
  }
}

function sequenceWindow(exists: number, request: MailListRequest): { start: number; end: number; hasMore: boolean } | null {
  const cursor = request.cursor === undefined ? exists : Number(request.cursor)
  if (!Number.isSafeInteger(cursor) || cursor < 1 || exists === 0) return null
  const end = Math.min(cursor, exists)
  const start = Math.max(1, end - request.limit)
  return { start, end, hasMore: start > 1 }
}

interface ParsedBody {
  text: string
  attachments: MailAttachmentMetadata[]
}

function parseSource(source: Buffer, maxChars: number): Promise<ParsedBody> {
  return new Promise((resolve, reject) => {
    const parser = new MailParser({
      skipHtmlToText: false,
      maxHtmlLengthToParse: maxChars * 4,
      skipImageLinks: true,
      skipTextToHtml: true,
      skipTextLinks: true,
    })
    const attachments: MailAttachmentMetadata[] = []
    let text = ''
    parser.on('data', (data: AttachmentStream | MessageText) => {
      if (data.type === 'attachment') {
        attachments.push({
          ...(data.filename === undefined ? {} : { filename: data.filename }),
          contentType: data.contentType,
          size: data.size,
        })
        data.content.on('data', () => undefined)
        data.release()
      } else {
        text = data.text ?? ''
      }
    })
    parser.once('error', reject)
    parser.once('end', () => resolve({ text, attachments }))
    parser.end(source)
  })
}

/**
 * Concrete IMAP/SMTP transport. Read operations are TLS-only and
 * read-only; send connects to SMTP with path/URL file access disabled.
 */
export class NodeMailTransport implements MailTransport {
  list(config: ResolvedConfig, password: string, request: MailListRequest, signal?: AbortSignal): Promise<MailListResult> {
    return withImap(config, password, signal, async (client) => {
      const lock = await client.getMailboxLock(config.mailbox, { readOnly: true })
      try {
        const mailbox = client.mailbox
        if (mailbox === false) throw new Error('mailbox unavailable')
        const window = sequenceWindow(mailbox.exists, request)
        if (window === null) return { messages: [], nextCursor: null, truncated: false }
        const rows = await client.fetchAll(`${window.start}:${window.end}`, { envelope: true, internalDate: true, bodyStructure: true })
        const messages = rows.reverse().slice(0, request.limit).map(summary)
        return { messages, nextCursor: window.hasMore ? String(window.start - 1) : null, truncated: rows.length > request.limit }
      } finally {
        lock.release()
      }
    })
  }

  read(config: ResolvedConfig, password: string, request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult> {
    return withImap(config, password, signal, async (client) => {
      const lock = await client.getMailboxLock(config.mailbox, { readOnly: true })
      try {
        const message = await client.fetchOne(request.id, {
          envelope: true,
          internalDate: true,
          bodyStructure: true,
          size: true,
          source: { start: 0, maxLength: MAX_SOURCE_BYTES },
        }, { uid: true })
        if (message === false || message.source === undefined) throw new Error('message unavailable')
        const parsed = await parseSource(message.source, request.maxChars)
        return {
          ...summary(message),
          text: parsed.text.slice(0, request.maxChars),
          truncated: parsed.text.length > request.maxChars || (message.size ?? 0) > message.source.length,
          attachments: parsed.attachments,
        }
      } finally {
        lock.release()
      }
    })
  }

  async send(config: ResolvedConfig, password: string, request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult> {
    assertNotAborted(signal)
    const transport = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      ignoreTLS: false,
      auth: { user: config.username, pass: password },
      logger: false,
      debug: false,
      disableFileAccess: true,
      disableUrlAccess: true,
      tls: { rejectUnauthorized: true, servername: config.smtp.host },
    })
    const abort = () => transport.close()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const result = await transport.sendMail({
        from: config.username,
        to: [...request.to],
        ...(request.cc === undefined ? {} : { cc: [...request.cc] }),
        subject: request.subject,
        text: request.text,
        disableFileAccess: true,
        disableUrlAccess: true,
      }) as SMTPTransport.SentMessageInfo
      return { messageId: result.messageId }
    } finally {
      signal?.removeEventListener('abort', abort)
      transport.close()
    }
  }
}
