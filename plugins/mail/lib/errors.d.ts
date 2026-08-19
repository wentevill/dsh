/** Stable, safe error codes owned by this plugin and suitable for tool clients. */
export type MailErrorCode = 'MAIL_APPROVAL_REQUIRED' | 'MAIL_ARCHIVE_FAILED' | 'MAIL_ARCHIVE_MAILBOX_UNAVAILABLE' | 'MAIL_ARCHIVE_UNSUPPORTED' | 'MAIL_ATTACHMENT_CHANGED' | 'MAIL_ATTACHMENT_INVALID' | 'MAIL_ATTACHMENT_INVALID_CONTENT_TYPE' | 'MAIL_ATTACHMENT_INVALID_FILENAME' | 'MAIL_ATTACHMENT_LIMIT_EXCEEDED' | 'MAIL_ATTACHMENT_NOT_REGULAR' | 'MAIL_ATTACHMENT_OUTSIDE_WORKSPACE' | 'MAIL_ATTACHMENT_TOO_LARGE' | 'MAIL_ATTACHMENT_WORKSPACE_UNAVAILABLE' | 'MAIL_BODY_INVALID' | 'MAIL_BODY_REQUIRED' | 'MAIL_BODY_TOO_LARGE' | 'MAIL_CREDENTIAL_UNAVAILABLE' | 'MAIL_DELETE_DISABLED' | 'MAIL_DELETE_FAILED' | 'MAIL_HEADER_INVALID' | 'MAIL_IMAP_DISABLED' | 'MAIL_INPUT_INVALID' | 'MAIL_MAILBOX_UNAVAILABLE' | 'MAIL_MESSAGE_UNAVAILABLE' | 'MAIL_PROVIDER_FAILURE' | 'MAIL_RECIPIENT_LIMIT_EXCEEDED' | 'MAIL_RECIPIENT_REQUIRED' | 'MAIL_SETTINGS_CHANGED' | 'MAIL_SMTP_DISABLED' | 'MAIL_TLS_REQUIRED' | 'MAIL_UID_DELETE_UNSUPPORTED' | 'MAIL_UID_INVALID' | 'MAIL_UNAVAILABLE' | 'MAIL_USERNAME_UNAVAILABLE';
export declare class MailError extends HarnessError {
    constructor(message: string, code: MailErrorCode, trust?: symbol);
}
/** @internal Mail sources use this issuer; the constructor alone is never trusted. */
export declare function mailError(message: string, code: MailErrorCode): MailError;
export declare function isTrustedMailError(error: unknown): error is MailError;
export declare function mailProviderFailure(_cause: unknown): MailError;
export declare function assertMailUid(value: unknown): string;
import { HarnessError } from '@deepseek-ai/dsh-llm';
