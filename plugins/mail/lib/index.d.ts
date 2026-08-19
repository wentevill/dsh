import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type CredentialRef } from '@deepseek-ai/dsh-credentials';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { MailArchiveRequest, MailArchiveResult, MailDeleteRequest, MailDeleteResult, MailListRequest, MailListResult, MailReadRequest, MailReadResult, MailSendRequest, MailSendResult } from './mail-types.ts';
import { type MailSettings } from './mail-settings.ts';
import type { MailSettingsSaveRequest, MailSettingsSaveResult } from './remote-types.ts';
export { NodeMailTransport } from './transport.ts';
export { MailImapTransport } from './imap-transport.ts';
export { normalizeBodies } from './html.ts';
export { MailSmtpTransport } from './smtp-transport.ts';
export { DEFAULT_ATTACHMENT_LIMITS, loadAttachments } from './attachment-loader.ts';
export type * from './mail-types.ts';
export { createMailApprovalPolicy } from './approval.ts';
export { MailCapabilityManager } from './tools.ts';
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
    readonly archiveMailbox?: string;
    readonly allowDelete?: boolean;
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
    readonly archiveMailbox: string;
    readonly allowDelete: boolean;
    readonly imap: EndpointConfig;
    readonly smtp: EndpointConfig;
}
/** Mail-owned Host/Client boundary; it never accepts an arbitrary namespace or path. */
export declare class MailSettingsRemote extends TypertRemoteService {
    private readonly scope;
    constructor(ctx: Context, scope: () => SettingsScope<MailSettings> | undefined);
    /** Read the resolved section without relying on DSH's fixed Web settings allowlist. */
    load(): MailSettingsSaveResult;
    /** Persist one complete non-secret mail section through the official Settings owner scope. */
    save(request: MailSettingsSaveRequest): Promise<MailSettingsSaveResult>;
}
/** Protocol transport seam, so tests/drivers can substitute a fake. */
export interface MailTransport {
    list(config: ResolvedConfig, password: string, request: MailListRequest, signal?: AbortSignal): Promise<MailListResult>;
    read(config: ResolvedConfig, password: string, request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult>;
    archive(config: ResolvedConfig, password: string, request: MailArchiveRequest, signal?: AbortSignal): Promise<MailArchiveResult>;
    delete(config: ResolvedConfig, password: string, request: MailDeleteRequest, signal?: AbortSignal): Promise<MailDeleteResult>;
    send(config: ResolvedConfig, password: string, request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult>;
}
export declare const Config: z<Config>;
/** Prefer the complete Mail settings section whenever the Host settings seam is available. */
export declare function resolveEffectiveConfig(bootstrap: ResolvedConfig, settings?: MailSettings): ResolvedConfig;
export declare const name = "mail";
/** Uses the key-management component (`credentials`) for the password. */
export declare const inject: string[];
export declare function apply(ctx: Context, config: Config): void;
