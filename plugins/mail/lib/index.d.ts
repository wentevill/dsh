import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type CredentialRef } from '@deepseek-ai/dsh-credentials';
import { type MailListRequest, type MailListResult, type MailReadRequest, type MailReadResult, type MailSendRequest, type MailSendResult } from '@deepseek-ai/dsh-mail';
export { NodeMailTransport } from './transport.js';
/** SMTP/IMAP endpoint: host + port + whether to connect securely (implicit TLS). */
export interface EndpointConfig {
    readonly host: string;
    readonly port: number;
    readonly secure: boolean;
}
/** User-facing plugin configuration (Schemastery-validated). */
export interface Config {
    readonly username: string;
    readonly passwordEnv?: string;
    readonly mailbox?: string;
    readonly imap: EndpointConfig;
    readonly smtp: EndpointConfig;
    readonly listMaxResults?: number;
    readonly readMaxChars?: number;
    readonly maxRecipients?: number;
    readonly maxBodyChars?: number;
}
/** Config after defaults/validation, holding a credential *reference* — never the password value. */
export interface ResolvedConfig {
    readonly username: string;
    readonly passwordRef: CredentialRef;
    readonly mailbox: string;
    readonly imap: EndpointConfig;
    readonly smtp: EndpointConfig;
}
/** Protocol transport seam, so tests/drivers can substitute a fake. */
export interface MailTransport {
    list(config: ResolvedConfig, password: string, request: MailListRequest, signal?: AbortSignal): Promise<MailListResult>;
    read(config: ResolvedConfig, password: string, request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult>;
    send(config: ResolvedConfig, password: string, request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult>;
}
export declare const Config: z<Config>;
export declare const name = "mail-plugin";
/** Uses the key-management component (`credentials`) for the password. */
export declare const inject: string[];
export declare function apply(ctx: Context, config: Config): void;
