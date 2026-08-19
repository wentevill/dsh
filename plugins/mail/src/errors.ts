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
const TRUSTED_MAIL_ERROR = Symbol('dsh-mail.trusted-error')
const trustedMailErrors = new WeakSet<MailError>()

type HarnessErrorConstructor = new (message: string, code: string, options?: ErrorOptions) => HarnessErrorType

function resolveHostHarnessError(): HarnessErrorConstructor {
  const anchors = [
    process.argv[1],
    resolve(dirname(process.execPath), '../../app/package.json'),
    import.meta.url,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)
  for (const anchor of anchors) {
    try {
      return createRequire(anchor)('@deepseek-ai/dsh-llm').HarnessError as HarnessErrorConstructor
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'MODULE_NOT_FOUND') throw error
    }
  }
  throw new Error('dsh-mail: Host @deepseek-ai/dsh-llm is unavailable')
}

const HarnessError = resolveHostHarnessError()

export class MailError extends HarnessError {

  constructor(message: string, code: MailErrorCode, trust?: symbol) {
    super(`${code}: ${message}`, code)
    this.name = 'MailError'
    if (trust === TRUSTED_MAIL_ERROR) trustedMailErrors.add(this)
  }
}

/** @internal Mail sources use this issuer; the constructor alone is never trusted. */
export function mailError(message: string, code: MailErrorCode): MailError {
  return new MailError(message, code, TRUSTED_MAIL_ERROR)
}

export function isTrustedMailError(error: unknown): error is MailError {
  return error instanceof MailError && trustedMailErrors.has(error)
}

export function mailProviderFailure(_cause: unknown): MailError {
  return mailError('mail provider operation failed', 'MAIL_PROVIDER_FAILURE')
}

const MAX_IMAP_UID = 0xffffffff

export function assertMailUid(value: unknown): string {
  if (
    typeof value !== 'string'
    || !/^[1-9][0-9]*$/u.test(value)
    || Number(value) > MAX_IMAP_UID
  ) {
    throw mailError('message UID must be an integer between 1 and 4294967295', 'MAIL_UID_INVALID')
  }
  return value
}
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { HarnessError as HarnessErrorType } from '@deepseek-ai/dsh-llm'
