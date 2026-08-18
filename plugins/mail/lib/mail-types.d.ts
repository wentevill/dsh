import type { MailAddress as UpstreamMailAddress, MailAttachmentMetadata as UpstreamMailAttachmentMetadata, MailListRequest as UpstreamMailListRequest, MailListResult as UpstreamMailListResult, MailMessageSummary as UpstreamMailMessageSummary, MailReadRequest as UpstreamMailReadRequest, MailReadResult as UpstreamMailReadResult, MailSendRequest as UpstreamMailSendRequest, MailSendResult as UpstreamMailSendResult } from '@deepseek-ai/dsh-mail';
/** Mail's stable aliases for the pre-existing upstream read/send contracts. */
export type MailAddress = UpstreamMailAddress;
export type MailAttachmentMetadata = UpstreamMailAttachmentMetadata;
export type MailListRequest = UpstreamMailListRequest;
export type MailListResult = UpstreamMailListResult;
export type MailMessageSummary = UpstreamMailMessageSummary;
export type MailReadRequest = UpstreamMailReadRequest;
export type MailReadResult = UpstreamMailReadResult;
export type MailSendRequest = UpstreamMailSendRequest;
export type MailSendResult = UpstreamMailSendResult;
/** Stable identity presented by this package for a mailbox message. */
export interface MailMessageIdentity {
    id: string;
    subject: string;
    from: MailAddress[];
}
/** Move one IMAP UID to the configured archive mailbox. */
export interface MailArchiveRequest {
    id: string;
}
/** The UID moved into an existing archive mailbox. */
export interface MailArchiveResult {
    id: string;
    mailbox: string;
    destinationId?: string;
}
/** Permanently delete one IMAP UID. */
export interface MailDeleteRequest {
    id: string;
}
/** Confirm a safe UID-targeted permanent deletion. */
export interface MailDeleteResult {
    id: string;
    deleted: true;
}
/** A caller-supplied attachment path, resolved only within its session workspace. */
export interface MailAttachmentRequest {
    path: string;
}
/** Byte and item limits enforced before attachment contents are read. */
export interface MailAttachmentLimits {
    maxFiles: number;
    maxFileBytes: number;
    maxTotalBytes: number;
}
/** A validated in-memory attachment safe to hand to the SMTP transport. */
export interface LoadedMailAttachment {
    filename: string;
    contentType: string;
    content: Buffer;
    size: number;
}
