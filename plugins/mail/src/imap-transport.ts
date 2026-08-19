import {
  ImapFlow,
  type CopyResponseObject,
  type FetchMessageObject,
  type ImapFlowOptions,
  type ListResponse,
  type MessageAddressObject,
  type MessageStructureObject,
} from 'imapflow'
import { MailParser, type AttachmentStream, type MessageText } from 'mailparser'
import { assertMailUid, mailError } from './errors.ts'
import type {
  MailAddress,
  MailArchiveRequest,
  MailArchiveResult,
  MailAttachmentMetadata,
  MailDeleteRequest,
  MailDeleteResult,
  MailListRequest,
  MailListResult,
  MailMessageSummary,
  MailReadRequest,
  MailReadResult,
} from './mail-types.ts'
import type { ResolvedConfig } from './index.ts'

/** Safety cap on a single fetched message source, in bytes. */
const MAX_SOURCE_BYTES = 2_000_000

const REV2_FOLDED_CAPABILITIES = new Set(['MOVE', 'UIDPLUS'])

/** Narrow ImapFlow surface used by Mail and injectable in transport tests. */
export type ImapFlowClient = Pick<ImapFlow,
  'capabilities' | 'close' | 'connect' | 'enabled' | 'fetchAll' | 'fetchOne' | 'getMailboxLock'
  | 'list' | 'logout' | 'mailbox' | 'messageDelete' | 'messageMove'
>

export type ImapFlowFactory = (options: ImapFlowOptions) => ImapFlowClient

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

function assertUid(id: string): void {
  assertMailUid(id)
}

function archiveDestinationId(result: CopyResponseObject | false, id: string): string | undefined {
  if (result === false || result.uidMap === undefined) return undefined
  const destinationId = result.uidMap.get(Number(id))
  return destinationId === undefined ? undefined : String(destinationId)
}

function hasArchiveMailbox(mailboxes: ListResponse[], archiveMailbox: string): boolean {
  return mailboxes.some(mailbox => mailbox.path === archiveMailbox)
}

function isRev2Active(client: ImapFlowClient): boolean {
  return client.enabled.has('IMAP4REV2')
    || (client.capabilities.has('IMAP4rev2') && !client.capabilities.has('IMAP4rev1'))
}

/** Mirrors ImapFlow's folded-capability behavior for IMAP4rev2 sessions. */
function hasCapability(client: ImapFlowClient, capability: 'MOVE' | 'UIDPLUS'): boolean {
  return client.capabilities.has(capability)
    || (REV2_FOLDED_CAPABILITIES.has(capability) && isRev2Active(client))
}

function supportsUidTargetedDelete(client: ImapFlowClient): boolean {
  return hasCapability(client, 'UIDPLUS')
}

function supportsSafeArchive(client: ImapFlowClient): boolean {
  // ImapFlow falls back from MOVE to UID COPY + UID STORE \\Deleted + UID EXPUNGE.
  // UIDPLUS is required so the expunge remains scoped to the requested UID.
  return hasCapability(client, 'MOVE') || hasCapability(client, 'UIDPLUS')
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

/** TLS-only IMAP list, read, archive, and permanent UID deletion transport. */
export class MailImapTransport {
  constructor(private readonly createClient: ImapFlowFactory = options => new ImapFlow(options)) {}

  list(config: ResolvedConfig, password: string, request: MailListRequest, signal?: AbortSignal): Promise<MailListResult> {
    return this.withImap(config, password, signal, async client => {
      const lock = await client.getMailboxLock(config.mailbox, { readOnly: true })
      try {
        const mailbox = client.mailbox
        if (mailbox === false) throw mailError('mailbox unavailable', 'MAIL_MAILBOX_UNAVAILABLE')
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

  async read(config: ResolvedConfig, password: string, request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult> {
    assertUid(request.id)
    return this.withImap(config, password, signal, async client => {
      const lock = await client.getMailboxLock(config.mailbox, { readOnly: true })
      try {
        const message = await client.fetchOne(request.id, {
          envelope: true,
          internalDate: true,
          bodyStructure: true,
          size: true,
          source: { start: 0, maxLength: MAX_SOURCE_BYTES },
        }, { uid: true })
        if (message === false || message.source === undefined) throw mailError('message unavailable', 'MAIL_MESSAGE_UNAVAILABLE')
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

  async archive(config: ResolvedConfig, password: string, request: MailArchiveRequest, signal?: AbortSignal): Promise<MailArchiveResult> {
    assertUid(request.id)
    return this.withImap(config, password, signal, async client => {
      const lock = await client.getMailboxLock(config.mailbox, { readOnly: false })
      try {
        if (!supportsSafeArchive(client)) throw mailError('server does not support safe UID archive', 'MAIL_ARCHIVE_UNSUPPORTED')
        const mailboxes = await client.list()
        if (!hasArchiveMailbox(mailboxes, config.archiveMailbox)) {
          throw mailError('archive mailbox is unavailable', 'MAIL_ARCHIVE_MAILBOX_UNAVAILABLE')
        }
        const result = await client.messageMove(request.id, config.archiveMailbox, { uid: true })
        if (result === false) throw mailError('archive operation failed', 'MAIL_ARCHIVE_FAILED')
        const destinationId = archiveDestinationId(result, request.id)
        return {
          id: request.id,
          mailbox: config.archiveMailbox,
          ...(destinationId === undefined ? {} : { destinationId }),
        }
      } finally {
        lock.release()
      }
    })
  }

  async delete(config: ResolvedConfig, password: string, request: MailDeleteRequest, signal?: AbortSignal): Promise<MailDeleteResult> {
    assertUid(request.id)
    return this.withImap(config, password, signal, async client => {
      const lock = await client.getMailboxLock(config.mailbox, { readOnly: false })
      try {
        // ImapFlow falls back to mailbox-wide EXPUNGE when UIDPLUS is absent.
        if (!supportsUidTargetedDelete(client)) {
          throw mailError('server does not support UID-targeted deletion', 'MAIL_UID_DELETE_UNSUPPORTED')
        }
        if (!await client.messageDelete(request.id, { uid: true })) throw mailError('delete operation failed', 'MAIL_DELETE_FAILED')
        return { id: request.id, deleted: true }
      } finally {
        lock.release()
      }
    })
  }

  private async withImap<T>(
    config: ResolvedConfig,
    password: string,
    signal: AbortSignal | undefined,
    operation: (client: ImapFlowClient) => Promise<T>,
  ): Promise<T> {
    assertNotAborted(signal)
    if (!config.imap.secure) throw mailError('IMAP must use TLS', 'MAIL_TLS_REQUIRED')
    const client = this.createClient({
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
}
