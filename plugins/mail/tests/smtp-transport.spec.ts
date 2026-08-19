import { describe, expect, it, vi } from 'vitest'
import { normalizeBodies } from '../src/html.ts'
import { MailSmtpTransport, type SmtpClient } from '../src/smtp-transport.ts'

const config = {
  username: 'sender@example.com',
  passwordRef: { provider: 'env', key: 'MAIL_APP_PASSWORD' },
  mailbox: 'INBOX',
  archiveMailbox: 'Archive',
  allowDelete: false,
  imap: { host: 'imap.example.com', port: 993, secure: true },
  smtp: { host: 'smtp.example.com', port: 465, secure: true },
}

function client(): SmtpClient {
  return {
    close: vi.fn(),
    sendMail: vi.fn().mockResolvedValue({
      messageId: '<provider-message-id>',
      envelope: { from: 'sender@example.com', to: ['visible@example.com', 'hidden@example.com'] },
      accepted: ['visible@example.com', 'hidden@example.com'],
    }),
  }
}

describe('normalizeBodies', () => {
  it('rejects a request with no body', () => {
    expect(() => normalizeBodies({})).toThrow('MAIL_BODY_REQUIRED')
  })

  it('preserves a plain text body', () => {
    expect(normalizeBodies({ text: 'Plain text' })).toEqual({ text: 'Plain text' })
  })

  it('derives the plain text alternative from HTML', () => {
    expect(normalizeBodies({ html: '<h1>Hello</h1><p>World</p>' })).toEqual({
      html: '<h1>Hello</h1><p>World</p>', text: 'Hello\n\nWorld',
    })
  })

  it('preserves explicitly supplied plain text and HTML', () => {
    expect(normalizeBodies({ text: 'Accessible text', html: '<p>Rich text</p>' })).toEqual({
      text: 'Accessible text', html: '<p>Rich text</p>',
    })
  })

  it.each([
    ['text', 'x'.repeat(500_001)],
    ['html', 'x'.repeat(1_000_001)],
  ] as const)('rejects a %s body above its exact limit', (field, value) => {
    expect(() => normalizeBodies({ [field]: value })).toThrow('MAIL_BODY_TOO_LARGE')
  })

  it('accepts text and HTML at their independent exact limits', () => {
    const result = normalizeBodies({ text: 't'.repeat(500_000), html: 'h'.repeat(1_000_000) })
    expect(result.text).toHaveLength(500_000)
    expect(result.html).toHaveLength(1_000_000)
  })

  it('rejects HTML whose generated plain-text alternative exceeds the text limit', () => {
    expect(() => normalizeBodies({ html: `<p>${'x'.repeat(500_001)}</p>` })).toThrow('MAIL_BODY_TOO_LARGE')
  })
})

describe('MailSmtpTransport', () => {
  it('returns structured Mail-owned TLS failures before opening SMTP', async () => {
    const createClient = vi.fn(() => client())
    const transport = new MailSmtpTransport(createClient)
    await expect(transport.send({ ...config, smtp: { ...config.smtp, secure: false } }, 'app-password', {
      to: [{ address: 'visible@example.com' }], subject: 'safe', text: 'body',
    })).rejects.toMatchObject({ code: 'MAIL_TLS_REQUIRED' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('sends normalized MIME with Bcc and Buffer-only attachments', async () => {
    const smtp = client()
    const createClient = vi.fn(() => smtp)
    const transport = new MailSmtpTransport(createClient)
    const first = Buffer.from('first attachment')
    const second = Buffer.from('second attachment')

    await expect(transport.send(config, 'app-password', {
      to: [{ address: 'visible@example.com', name: 'Visible Recipient' }],
      cc: [{ address: 'copy@example.com' }],
      bcc: [{ address: 'hidden@example.com' }],
      subject: 'Quarterly update',
      html: '<h1>Hello</h1><p>World</p>',
      attachments: [
        { filename: 'first.txt', contentType: 'text/plain', content: first, size: first.length },
        { filename: 'second.bin', contentType: 'application/octet-stream', content: second, size: second.length },
      ],
    })).resolves.toEqual({ messageId: '<provider-message-id>' })

    expect(createClient).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.example.com', port: 465, secure: true,
      disableFileAccess: true, disableUrlAccess: true,
    }))
    expect(smtp.sendMail).toHaveBeenCalledWith({
      from: 'sender@example.com',
      to: [{ address: 'visible@example.com', name: 'Visible Recipient' }],
      cc: [{ address: 'copy@example.com' }],
      bcc: [{ address: 'hidden@example.com' }],
      subject: 'Quarterly update',
      text: 'Hello\n\nWorld',
      html: '<h1>Hello</h1><p>World</p>',
      attachments: [
        { filename: 'first.txt', contentType: 'text/plain', content: first },
        { filename: 'second.bin', contentType: 'application/octet-stream', content: second },
      ],
      disableFileAccess: true,
      disableUrlAccess: true,
    })
    expect(smtp.close).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['recipient address', { to: [{ address: 'victim@example.com\r\nBcc: attacker@example.com' }], text: 'body' }],
    ['recipient name', { to: [{ address: 'victim@example.com', name: 'Victim\nBcc: attacker@example.com' }], text: 'body' }],
    ['subject', { to: [{ address: 'victim@example.com' }], subject: 'Hello\r\nBcc: attacker@example.com', text: 'body' }],
    ['attachment filename', { to: [{ address: 'victim@example.com' }], text: 'body', attachments: [{ filename: 'safe.txt\r\nBcc: attacker@example.com', contentType: 'text/plain', content: Buffer.from('x'), size: 1 }] }],
    ['attachment content type', { to: [{ address: 'victim@example.com' }], text: 'body', attachments: [{ filename: 'safe.txt', contentType: 'text/plain\r\nBcc: attacker@example.com', content: Buffer.from('x'), size: 1 }] }],
  ])('rejects CR/LF header injection in %s before opening SMTP', async (_label, request) => {
    const createClient = vi.fn(() => client())
    const transport = new MailSmtpTransport(createClient)

    await expect(transport.send(config, 'app-password', {
      subject: 'safe',
      ...request,
    })).rejects.toThrow('MAIL_HEADER_INVALID')
    expect(createClient).not.toHaveBeenCalled()
  })

  it.each([
    { filename: 'safe.txt', contentType: 'text/plain', content: 'aGVsbG8=', size: 5 },
    { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), path: '/tmp/secret', size: 5 },
    { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), href: 'https://example.com/file', size: 5 },
    { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), url: 'https://example.com/file', size: 5 },
    { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), encoding: 'base64', size: 5 },
  ])('rejects attachment input that is not a loaded Buffer', async attachment => {
    const createClient = vi.fn(() => client())
    const transport = new MailSmtpTransport(createClient)

    await expect(transport.send(config, 'app-password', {
      to: [{ address: 'visible@example.com' }], subject: 'safe', text: 'body', attachments: [attachment] as never,
    })).rejects.toThrow('MAIL_ATTACHMENT_INVALID')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('snapshots text and HTML getters exactly once before normalizing bodies', async () => {
    const smtp = client()
    const transport = new MailSmtpTransport(() => smtp)
    let textReads = 0
    let htmlReads = 0
    const request = {
      to: [{ address: 'visible@example.com' }], subject: 'safe',
      get text() { textReads += 1; return 'plain' },
      get html() { htmlReads += 1; return '<p>rich</p>' },
    }

    await expect(transport.send(config, 'app-password', request)).resolves.toEqual({ messageId: '<provider-message-id>' })
    expect(textReads).toBe(1)
    expect(htmlReads).toBe(1)
  })

  it.each([
    { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), size: 5, raw: 'forbidden' },
    { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), size: 5, headers: {} },
    { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), size: 5, contentDisposition: 'inline' },
    Object.assign(Object.create({ inherited: true }), { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), size: 5 }),
    Object.defineProperties({}, {
      filename: { enumerable: true, get: () => 'safe.txt' },
      contentType: { enumerable: true, value: 'text/plain' },
      content: { enumerable: true, value: Buffer.from('hello') },
      size: { enumerable: true, value: 5 },
    }),
    Object.defineProperty({ filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), size: 5 }, 'path', {
      value: '/tmp/secret', enumerable: false,
    }),
    Object.defineProperty({ filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), size: 5 }, 'raw', {
      value: 'forbidden', enumerable: false,
    }),
    { filename: 'safe.txt', contentType: 'text/plain', content: Buffer.from('hello'), size: 5, [Symbol('hidden')]: true },
  ])('rejects a non-exact loaded attachment schema', async attachment => {
    const smtp = client()
    const createClient = vi.fn(() => smtp)
    const transport = new MailSmtpTransport(createClient)

    await expect(transport.send(config, 'app-password', {
      to: [{ address: 'visible@example.com' }], subject: 'safe', text: 'body', attachments: [attachment] as never,
    })).rejects.toThrow('MAIL_ATTACHMENT_INVALID')
    expect(createClient).not.toHaveBeenCalled()
    expect(smtp.sendMail).not.toHaveBeenCalled()
  })

  it('does not call the provider when already aborted', async () => {
    const smtp = client()
    const createClient = vi.fn(() => smtp)
    const transport = new MailSmtpTransport(createClient)
    const controller = new AbortController()
    controller.abort()

    await expect(transport.send(config, 'app-password', {
      to: [{ address: 'visible@example.com' }], subject: 'safe', text: 'body',
    }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(createClient).not.toHaveBeenCalled()
    expect(smtp.sendMail).not.toHaveBeenCalled()
  })

  it('reports the provider result when aborted after send begins', async () => {
    let resolveSend!: (value: { messageId: string }) => void
    const smtp: SmtpClient = {
      close: vi.fn(),
      sendMail: vi.fn(() => new Promise(resolve => { resolveSend = resolve as (value: { messageId: string }) => void })),
    }
    const transport = new MailSmtpTransport(() => smtp)
    const controller = new AbortController()
    const sending = transport.send(config, 'app-password', {
      to: [{ address: 'visible@example.com' }], subject: 'safe', text: 'body',
    }, controller.signal)

    await vi.waitFor(() => expect(smtp.sendMail).toHaveBeenCalledTimes(1))
    controller.abort()
    expect(smtp.close).not.toHaveBeenCalled()
    resolveSend({ messageId: '<provider-message-id>' })

    await expect(sending).resolves.toEqual({ messageId: '<provider-message-id>' })
    expect(smtp.close).toHaveBeenCalledTimes(1)
  })
})
