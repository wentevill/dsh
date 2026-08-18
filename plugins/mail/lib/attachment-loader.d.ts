import type { LoadedMailAttachment, MailAttachmentLimits, MailAttachmentRequest } from './mail-types.ts';
/** Limits for workspace files accepted by the mail send operation. */
export declare const DEFAULT_ATTACHMENT_LIMITS: MailAttachmentLimits;
/** Deterministic lifecycle hooks used to test replacement races around open and metadata checks. */
export interface AttachmentLoaderHooks {
    beforeOpen?(path: string): Promise<void> | void;
    afterOpen?(path: string): Promise<void> | void;
    afterMetadata?(path: string): Promise<void> | void;
    afterClose?(path: string): Promise<void> | void;
}
/**
 * Creates an attachment loader with test-only lifecycle hooks. Production uses
 * {@link loadAttachments}, which has no hooks and always uses Node file handles.
 */
export declare function createAttachmentLoader(hooks?: AttachmentLoaderHooks): (requests: readonly MailAttachmentRequest[], workspace: string, limits?: MailAttachmentLimits, signal?: AbortSignal) => Promise<LoadedMailAttachment[]>;
/**
 * Loads only regular files canonically contained by a session workspace.
 * It validates path and handle metadata before reading from those same handles.
 */
export declare const loadAttachments: (requests: readonly MailAttachmentRequest[], workspace: string, limits?: MailAttachmentLimits, signal?: AbortSignal) => Promise<LoadedMailAttachment[]>;
