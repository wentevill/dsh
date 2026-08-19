/** Stable, safe error codes owned by this plugin and suitable for tool clients. */
export type MailErrorCode =
  | 'MAIL_APPROVAL_REQUIRED'
  | 'MAIL_ARCHIVE_FAILED'
  | 'MAIL_ARCHIVE_MAILBOX_UNAVAILABLE'
  | 'MAIL_ARCHIVE_UNSUPPORTED'
  | 'MAIL_ATTACHMENT_CHANGED'
  | 'MAIL_ATTACHMENT_INVALID'
  | 'MAIL_ATTACHMENT_INVALID_CONTENT_TYPE'
  | 'MAIL_ATTACHMENT_INVALID_FILENAME'
  | 'MAIL_ATTACHMENT_LIMIT_EXCEEDED'
  | 'MAIL_ATTACHMENT_NOT_REGULAR'
  | 'MAIL_ATTACHMENT_OUTSIDE_WORKSPACE'
  | 'MAIL_ATTACHMENT_TOO_LARGE'
  | 'MAIL_ATTACHMENT_WORKSPACE_UNAVAILABLE'
  | 'MAIL_BODY_INVALID'
  | 'MAIL_BODY_REQUIRED'
  | 'MAIL_BODY_TOO_LARGE'
  | 'MAIL_CREDENTIAL_UNAVAILABLE'
  | 'MAIL_DELETE_DISABLED'
  | 'MAIL_DELETE_FAILED'
  | 'MAIL_HEADER_INVALID'
  | 'MAIL_IMAP_DISABLED'
  | 'MAIL_INPUT_INVALID'
  | 'MAIL_MAILBOX_UNAVAILABLE'
  | 'MAIL_MESSAGE_UNAVAILABLE'
  | 'MAIL_PROVIDER_FAILURE'
  | 'MAIL_RECIPIENT_LIMIT_EXCEEDED'
  | 'MAIL_RECIPIENT_REQUIRED'
  | 'MAIL_SETTINGS_CHANGED'
  | 'MAIL_SMTP_DISABLED'
  | 'MAIL_TLS_REQUIRED'
  | 'MAIL_UID_DELETE_UNSUPPORTED'
  | 'MAIL_UID_INVALID'
  | 'MAIL_UNAVAILABLE'
  | 'MAIL_USERNAME_UNAVAILABLE'

/**
 * Only instances of this Mail-owned class may cross the provider boundary
 * without being collapsed to MAIL_PROVIDER_FAILURE.
 */
export class MailError extends Error {
  readonly code: MailErrorCode

  constructor(message: string, code: MailErrorCode) {
    super(`${code}: ${message}`)
    this.name = 'MailError'
    this.code = code
  }

  static providerFailure(_cause: unknown): MailError {
    return new MailError('mail provider operation failed', 'MAIL_PROVIDER_FAILURE')
  }
}

const MAX_IMAP_UID = 0xffffffff

export function assertMailUid(value: unknown): string {
  if (
    typeof value !== 'string'
    || !/^[1-9][0-9]*$/u.test(value)
    || Number(value) > MAX_IMAP_UID
  ) {
    throw new MailError('message UID must be an integer between 1 and 4294967295', 'MAIL_UID_INVALID')
  }
  return value
}
