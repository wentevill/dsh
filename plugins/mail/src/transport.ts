import { MailImapTransport } from './imap-transport.ts'
import { MailSmtpTransport } from './smtp-transport.ts'
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

/** Backwards-compatible combined IMAP/SMTP facade; IMAP operations delegate to MailImapTransport. */
export class NodeMailTransport implements MailTransport {
  constructor(
    private readonly imap = new MailImapTransport(),
    private readonly smtp = new MailSmtpTransport(),
  ) {}

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
    return this.smtp.send(config, password, request, signal)
  }
}
