import nodemailer from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js'
import { MailImapTransport } from './imap-transport.ts'
import type {
  MailArchiveRequest,
  MailArchiveResult,
  MailDeleteRequest,
  MailDeleteResult,
  MailListRequest,
  MailListResult,
  MailReadRequest,
  MailReadResult,
  MailSendRequest,
  MailSendResult,
} from './mail-types.ts'
import type { MailTransport, ResolvedConfig } from './index.ts'

function assertNotAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted()
}

/** Backwards-compatible combined IMAP/SMTP facade; IMAP operations delegate to MailImapTransport. */
export class NodeMailTransport implements MailTransport {
  constructor(private readonly imap = new MailImapTransport()) {}

  list(config: ResolvedConfig, password: string, request: MailListRequest, signal?: AbortSignal): Promise<MailListResult> {
    return this.imap.list(config, password, request, signal)
  }

  read(config: ResolvedConfig, password: string, request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult> {
    return this.imap.read(config, password, request, signal)
  }

  archive(config: ResolvedConfig, password: string, request: MailArchiveRequest, signal?: AbortSignal): Promise<MailArchiveResult> {
    return this.imap.archive(config, password, request, signal)
  }

  delete(config: ResolvedConfig, password: string, request: MailDeleteRequest, signal?: AbortSignal): Promise<MailDeleteResult> {
    return this.imap.delete(config, password, request, signal)
  }

  async send(config: ResolvedConfig, password: string, request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult> {
    assertNotAborted(signal)
    if (!config.smtp.secure) throw new Error('SMTP must use TLS')
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
