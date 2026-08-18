import { describe, expect, it, vi } from 'vitest'
import { MailImapTransport, type ImapFlowClient } from '../src/imap-transport.ts'

const config = {
  username: 'user@example.com',
  passwordRef: { provider: 'env', key: 'MAIL_APP_PASSWORD' },
  mailbox: 'INBOX',
  archiveMailbox: 'Archive',
  allowDelete: true,
  imap: { host: 'imap.example.com', port: 993, secure: true },
  smtp: { host: 'smtp.example.com', port: 465, secure: true },
}

function client(overrides: Partial<ImapFlowClient> = {}): ImapFlowClient {
  return {
    capabilities: new Map([['UIDPLUS', true]]),
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }),
    list: vi.fn().mockResolvedValue([{ path: 'Archive' }]),
    messageMove: vi.fn().mockResolvedValue({}),
    messageDelete: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('MailImapTransport mutations', () => {
  it('moves exactly the requested UID to the configured archive mailbox', async () => {
    const imap = client()
    const transport = new MailImapTransport(() => imap)

    await expect(transport.archive(config, 'app-password', { id: '42' })).resolves.toEqual({ id: '42', mailbox: 'Archive' })

    expect(imap.getMailboxLock).toHaveBeenCalledWith('INBOX', { readOnly: false })
    expect(imap.list).toHaveBeenCalledWith()
    expect(imap.messageMove).toHaveBeenCalledWith('42', 'Archive', { uid: true })
  })

  it('rejects a missing archive mailbox before moving the message', async () => {
    const imap = client({ list: vi.fn().mockResolvedValue([]) })
    const transport = new MailImapTransport(() => imap)

    await expect(transport.archive(config, 'app-password', { id: '42' })).rejects.toThrow('IMAP_ARCHIVE_MAILBOX_UNAVAILABLE')

    expect(imap.messageMove).not.toHaveBeenCalled()
  })

  it('rejects archive providers whose move fallback could expunge another UID', async () => {
    const imap = client({ capabilities: new Map() })
    const transport = new MailImapTransport(() => imap)

    await expect(transport.archive(config, 'app-password', { id: '42' })).rejects.toThrow('IMAP_ARCHIVE_UNSUPPORTED')

    expect(imap.messageMove).not.toHaveBeenCalled()
  })

  it('rejects a non-UID archive id before contacting the provider', async () => {
    const imap = client()
    const createClient = vi.fn(() => imap)
    const transport = new MailImapTransport(createClient)

    await expect(transport.archive(config, 'app-password', { id: '1:*' })).rejects.toThrow('IMAP_UID_INVALID')

    expect(createClient).not.toHaveBeenCalled()
    expect(imap.messageMove).not.toHaveBeenCalled()
  })

  it('permanently deletes exactly the requested UID through the safe ImapFlow path', async () => {
    const imap = client()
    const transport = new MailImapTransport(() => imap)

    await expect(transport.delete(config, 'app-password', { id: '42' })).resolves.toEqual({ id: '42', deleted: true })

    expect(imap.getMailboxLock).toHaveBeenCalledWith('INBOX', { readOnly: false })
    expect(imap.messageDelete).toHaveBeenCalledWith('42', { uid: true })
  })

  it('rejects providers without UID-targeted delete before mutation', async () => {
    const expunge = vi.fn()
    const imap = Object.assign(client({ capabilities: new Map() }), { expunge })
    const transport = new MailImapTransport(() => imap)

    await expect(transport.delete(config, 'app-password', { id: '42' })).rejects.toThrow('IMAP_UID_DELETE_UNSUPPORTED')

    expect(imap.messageDelete).not.toHaveBeenCalled()
    expect(expunge).not.toHaveBeenCalled()
  })
})
