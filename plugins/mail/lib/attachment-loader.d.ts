import type { LoadedMailAttachment, MailAttachmentLimits, MailAttachmentRequest } from './mail-types.ts';
/** Limits for workspace files accepted by the mail send operation. */
export declare const DEFAULT_ATTACHMENT_LIMITS: MailAttachmentLimits;
/**
 * Loads only regular files canonically contained by a session workspace.
 * Metadata and cumulative limits are validated before any file content is read.
 */
export declare function loadAttachments(requests: readonly MailAttachmentRequest[], workspace: string, limits?: MailAttachmentLimits, signal?: AbortSignal): Promise<LoadedMailAttachment[]>;
