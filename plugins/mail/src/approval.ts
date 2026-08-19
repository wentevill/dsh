import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { MailAddress } from './mail-types.ts'

export interface MailSendApprovalMetadata {
  readonly to: readonly MailAddress[]
  readonly cc: readonly MailAddress[]
  readonly bccCount: number
  readonly subject: string
  readonly formats: readonly ('text' | 'html')[]
  readonly attachments: readonly string[]
  readonly attachmentBytes: number
}

export interface MailDeleteApprovalMetadata {
  readonly id: string
  readonly subject: string
  readonly from: readonly MailAddress[]
}

export interface MailApprovalPreparer {
  prepareSend(exec: Readonly<ToolExecution>): Promise<MailSendApprovalMetadata>
  prepareDelete(exec: Readonly<ToolExecution>): Promise<MailDeleteApprovalMetadata>
}

function quoteUntrusted(value: string): string {
  // C0/C1 controls, ANSI ESC, and Unicode bidi/format controls cannot alter
  // the structure or visual ordering of an approval prompt.
  return JSON.stringify(value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}]/gu, '\uFFFD'))
}

function formatAddress(value: MailAddress): string {
  return value.name === undefined
    ? quoteUntrusted(value.address)
    : `${quoteUntrusted(value.name)} <${quoteUntrusted(value.address)}>`
}

function formatAddresses(values: readonly MailAddress[]): string {
  return values.length === 0 ? '(none)' : values.map(formatAddress).join(', ')
}

function sendReason(metadata: MailSendApprovalMetadata): string {
  const total = metadata.to.length + metadata.cc.length + metadata.bccCount
  const formats = metadata.formats.length === 0 ? '(none)' : metadata.formats.join(', ')
  const attachments = metadata.attachments.length === 0 ? '(none)' : metadata.attachments.map(quoteUntrusted).join(', ')
  return `Send email? To (${metadata.to.length}): ${formatAddresses(metadata.to)}; Cc (${metadata.cc.length}): ${formatAddresses(metadata.cc)}; recipients: ${total} total; subject: ${quoteUntrusted(metadata.subject)}; formats: ${formats}; attachments: ${attachments}; attachment bytes: ${metadata.attachmentBytes} bytes.`
}

function deleteReason(metadata: MailDeleteApprovalMetadata): string {
  return `Permanently delete email UID ${quoteUntrusted(metadata.id)}? Subject: ${quoteUntrusted(metadata.subject)}; From: ${formatAddresses(metadata.from)}.`
}

/** Fresh one-shot approval policy for Mail's two mutating operations. */
export function createMailApprovalPolicy(preparer: MailApprovalPreparer) {
  return async (exec: Readonly<ToolExecution>, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
    if (exec.name === 'mail_send') return { kind: 'ask', reason: sendReason(await preparer.prepareSend(exec)) }
    if (exec.name === 'mail_delete') return { kind: 'ask', reason: deleteReason(await preparer.prepareDelete(exec)) }
    return next()
  }
}
