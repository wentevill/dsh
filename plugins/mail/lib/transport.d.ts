import { MailImapTransport } from './imap-transport.ts';
import { MailSmtpTransport } from './smtp-transport.ts';
import type { MailArchiveRequest, MailArchiveResult, MailDeleteRequest, MailDeleteResult, MailListRequest, MailListResult, MailReadRequest, MailReadResult, MailSendRequest, MailSendResult } from './mail-types.ts';
import type { MailTransport, ResolvedConfig } from './index.ts';
/** Backwards-compatible combined IMAP/SMTP facade; IMAP operations delegate to MailImapTransport. */
export declare class NodeMailTransport implements MailTransport {
    private readonly imap;
    private readonly smtp;
    constructor(imap?: MailImapTransport, smtp?: MailSmtpTransport);
    list(config: ResolvedConfig, password: string, request: MailListRequest, signal?: AbortSignal): Promise<MailListResult>;
    read(config: ResolvedConfig, password: string, request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult>;
    archive(config: ResolvedConfig, password: string, request: MailArchiveRequest, signal?: AbortSignal): Promise<MailArchiveResult>;
    delete(config: ResolvedConfig, password: string, request: MailDeleteRequest, signal?: AbortSignal): Promise<MailDeleteResult>;
    send(config: ResolvedConfig, password: string, request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult>;
}
