import { HarnessError } from '@deepseek-ai/dsh-llm'

declare const mailMessageIdBrand: unique symbol
export type MailMessageId = string & { readonly [mailMessageIdBrand]: true }

export interface MailAddress {
  readonly address: string
  readonly name?: string
}

export interface MailMessageSummary {
  readonly id: string
  readonly from: readonly MailAddress[]
  readonly to: readonly MailAddress[]
  readonly cc?: readonly MailAddress[]
  readonly subject: string
  readonly receivedAt: string
  readonly hasAttachments: boolean
}

export interface MailAttachmentMetadata {
  readonly filename?: string
  readonly contentType: string
  readonly size: number
}

export interface MailListRequest {
  readonly limit: number
  readonly cursor?: string
}

export interface MailListResult {
  readonly messages: readonly MailMessageSummary[]
  readonly nextCursor: string | null
  readonly truncated: boolean
}

export interface MailReadRequest {
  readonly id: string
  readonly maxChars: number
}

export interface MailReadResult extends MailMessageSummary {
  readonly text: string
  readonly truncated: boolean
  readonly attachments: readonly MailAttachmentMetadata[]
}

export interface MailSendRequest {
  readonly to: readonly MailAddress[]
  readonly cc?: readonly MailAddress[]
  readonly subject: string
  readonly text: string
}

export interface MailSendResult {
  readonly messageId: string
}

export interface MailProvider {
  readonly id: string
  available(): boolean
  list(request: MailListRequest, signal?: AbortSignal): Promise<MailListResult>
  read(request: MailReadRequest, signal?: AbortSignal): Promise<MailReadResult>
  send(request: MailSendRequest, signal?: AbortSignal): Promise<MailSendResult>
}

export class MailError extends HarnessError {
  static providerFailure(_cause: unknown): MailError {
    return new MailError('mail provider operation failed', 'MAIL_PROVIDER_FAILURE')
  }
}
