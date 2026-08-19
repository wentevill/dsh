import { describe, expect, it, vi } from 'vitest'
import { createMailApprovalPolicy } from '../src/approval.ts'

function execution(name: string, arguments_: unknown) {
  return {
    callId: 'call-1',
    rootCallId: 'call-1',
    name,
    arguments: arguments_,
    token: Symbol(name),
    signal: new AbortController().signal,
  }
}

describe('mail approval policy', () => {
  it('asks freshly for every send and delete invocation', async () => {
    const prepareSend = vi.fn(async () => ({
      to: [{ address: 'to@example.com' }], cc: [], formats: ['text'] as const,
      bccCount: 0, subject: 'Hello', attachments: [], attachmentBytes: 0,
    }))
    const prepareDelete = vi.fn(async () => ({
      id: '42', subject: 'Quarterly report', from: [{ address: 'sender@example.com' }],
    }))
    const policy = createMailApprovalPolicy({ prepareSend, prepareDelete })
    const next = vi.fn(async () => ({ kind: 'allow' as const }))

    expect(await policy(execution('mail_send', {} as never) as never, next)).toMatchObject({ kind: 'ask' })
    expect(await policy(execution('mail_send', {} as never) as never, next)).toMatchObject({ kind: 'ask' })
    expect(await policy(execution('mail_delete', { id: '42' }) as never, next)).toMatchObject({ kind: 'ask' })
    expect(await policy(execution('mail_delete', { id: '42' }) as never, next)).toMatchObject({ kind: 'ask' })
    expect(prepareSend).toHaveBeenCalledTimes(2)
    expect(prepareDelete).toHaveBeenCalledTimes(2)
    expect(next).not.toHaveBeenCalled()
  })

  it('delegates list, read, and archive without introducing approval', async () => {
    const policy = createMailApprovalPolicy({
      prepareSend: vi.fn(),
      prepareDelete: vi.fn(),
    })
    const next = vi.fn(async () => ({ kind: 'allow' as const }))

    for (const name of ['mail_list', 'mail_read', 'mail_archive']) {
      expect(await policy(execution(name, {}) as never, next)).toEqual({ kind: 'allow' })
    }
    expect(next).toHaveBeenCalledTimes(3)
  })

  it('summarizes send recipients, formats, and attachment sizes without sensitive content', async () => {
    const policy = createMailApprovalPolicy({
      prepareSend: async () => ({
        to: [{ address: 'to@example.com' }, { name: 'Team', address: 'team@example.com' }],
        cc: [{ address: 'copy@example.com' }], bccCount: 1, subject: 'Public subject',
        formats: ['text', 'html'],
        attachments: ['report.pdf', 'data.csv'],
        attachmentBytes: 12_345,
      }),
      prepareDelete: vi.fn(),
    })
    const args = {
      to: ['to@example.com', 'team@example.com'], cc: ['copy@example.com'], bcc: ['blind-secret@example.com'],
      subject: 'Public subject', text: 'TOP SECRET BODY', html: '<p>TOP SECRET HTML</p>', password: 'secret-password',
    }

    const decision = await policy(execution('mail_send', args) as never, vi.fn())

    expect(decision).toMatchObject({ kind: 'ask' })
    const reason = decision.kind === 'ask' ? decision.reason ?? '' : ''
    expect(reason).toContain('To (2)')
    expect(reason).toContain('Cc (1)')
    expect(reason).toContain('4 total')
    expect(reason).toContain('Public subject')
    expect(reason).toContain('text, html')
    expect(reason).toContain('"report.pdf", "data.csv"')
    expect(reason).toContain('12345 bytes')
    expect(reason).not.toContain('TOP SECRET BODY')
    expect(reason).not.toContain('TOP SECRET HTML')
    expect(reason).not.toContain('blind-secret@example.com')
    expect(reason).not.toContain('secret-password')
  })

  it('summarizes delete identity with UID, subject, and sender', async () => {
    const policy = createMailApprovalPolicy({
      prepareSend: vi.fn(),
      prepareDelete: async () => ({
        id: '731', subject: 'Message to remove', from: [{ name: 'Sender', address: 'sender@example.com' }],
      }),
    })

    const decision = await policy(execution('mail_delete', { id: '731' }) as never, vi.fn())

    const reason = decision.kind === 'ask' ? decision.reason ?? '' : ''
    expect(reason).toContain('UID "731"')
    expect(reason).toContain('Message to remove')
    expect(reason).toContain('"Sender" <"sender@example.com">')
  })

  it('quotes and sanitizes control, ANSI, and bidi characters in every untrusted display field', async () => {
    const poison = '\r\n\u001b[31m\u2028\u2029\u202E; attachments: injected'
    const policy = createMailApprovalPolicy({
      prepareSend: async () => ({
        to: [{ name: `To${poison}`, address: `to${poison}@example.com` }],
        cc: [{ address: `cc${poison}@example.com` }], bccCount: 0,
        subject: `Subject${poison}`, formats: ['text'],
        attachments: [`report${poison}.txt`], attachmentBytes: 1,
      }),
      prepareDelete: async () => ({
        id: `42${poison}`, subject: `Delete${poison}`,
        from: [{ name: `Sender${poison}`, address: `sender${poison}@example.com` }],
      }),
    })

    for (const [name, args] of [['mail_send', {}], ['mail_delete', { id: '42' }]] as const) {
      const decision = await policy(execution(name, args) as never, vi.fn())
      const reason = decision.kind === 'ask' ? decision.reason ?? '' : ''
      expect(reason).not.toMatch(/[\r\n\u001b\u2028\u2029\u202A-\u202E\u2066-\u2069]/u)
      expect(reason).toContain('"')
      expect(reason).toContain('�')
    }
  })
})
