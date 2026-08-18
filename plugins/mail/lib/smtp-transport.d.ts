import { type SendMailOptions } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type { MailSendRequest, MailSendResult } from './mail-types.ts';
import type { ResolvedConfig } from './index.ts';
export interface SmtpClient {
    sendMail(message: SendMailOptions): Promise<SMTPTransport.SentMessageInfo>;
    close(): void;
}
export type CreateSmtpClient = (options: SMTPTransport.Options) => SmtpClient;
/** TLS-only SMTP sender that builds MIME only from snapshots and loaded attachment Buffers. */
export declare class MailSmtpTransport {
    private readonly createClient;
    constructor(createClient?: CreateSmtpClient);
    send(config: ResolvedConfig, password: string, request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult>;
}
