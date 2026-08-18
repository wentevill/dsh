import type { MailListRequest, MailListResult, MailReadRequest, MailReadResult, MailSendRequest, MailSendResult } from '@deepseek-ai/dsh-mail';
import type { MailTransport, ResolvedConfig } from './index.js';
/**
 * Concrete IMAP/SMTP transport. Read operations are TLS-only and
 * read-only; send connects to SMTP with path/URL file access disabled.
 */
export declare class NodeMailTransport implements MailTransport {
    list(config: ResolvedConfig, password: string, request: MailListRequest, signal?: AbortSignal): Promise<MailListResult>;
    read(config: ResolvedConfig, password: string, request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult>;
    send(config: ResolvedConfig, password: string, request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult>;
}
