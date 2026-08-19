import { describe, expect, it, vi } from 'vitest'
import type { MailSettings } from '../src/mail-settings.ts'
import type { MailTransport, ResolvedConfig } from '../src/index.ts'
import { createMailApprovalPolicy } from '../src/approval.ts'
import { MailCapabilityManager } from '../src/tools.ts'

const disabled: MailSettings = {
  username: 'user@example.com', passwordEnv: 'MAIL_PASSWORD', mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: false,
  imap: { host: '', port: 993, secure: true }, smtp: { host: '', port: 465, secure: true },
}
const imapOnly: MailSettings = { ...disabled, imap: { ...disabled.imap, host: 'imap.test' } }
const smtpOnly: MailSettings = { ...disabled, smtp: { ...disabled.smtp, host: 'smtp.test' } }

class FakeSettingsScope {
  private readonly watchers = new Set<(next: MailSettings, prev: MailSettings) => void | Promise<void>>()
  constructor(private value: MailSettings) {}
  get(): MailSettings { return this.value }
  watch(callback: (next: MailSettings, prev: MailSettings) => void | Promise<void>): () => void {
    this.watchers.add(callback)
    return () => this.watchers.delete(callback)
  }
  async set(next: MailSettings): Promise<void> {
    const prev = this.value
    this.value = next
    for (const watcher of [...this.watchers]) await watcher(next, prev)
  }
}

class FakeTools {
  readonly definitions = new Map<string, { name: string; execute(args: unknown, exec: unknown): Promise<unknown> }>()
  readonly lifecycle: string[] = []
  register(definition: { name: string; execute(args: unknown, exec: unknown): Promise<unknown> }): () => void {
    if (this.definitions.has(definition.name)) throw new Error(`duplicate tool ${definition.name}`)
    this.definitions.set(definition.name, definition)
    this.lifecycle.push(`add:${definition.name}`)
    return () => {
      if (this.definitions.get(definition.name) !== definition) throw new Error(`stale disposer ${definition.name}`)
      this.definitions.delete(definition.name)
      this.lifecycle.push(`remove:${definition.name}`)
    }
  }
}

function fakeContext(tools: FakeTools) {
  return {
    tools,
    effect(execute: () => Iterable<() => unknown>) {
      const disposers = [...execute()]
      let disposed = false
      return async () => {
        if (disposed) return
        disposed = true
        for (const dispose of disposers.reverse()) await dispose()
      }
    },
  }
}

function resolveConfig(settings: MailSettings): ResolvedConfig {
  return {
    username: settings.username,
    passwordRef: { provider: 'env', key: settings.passwordEnv } as never,
    mailbox: settings.mailbox,
    archiveMailbox: settings.archiveMailbox,
    allowDelete: settings.allowDelete,
    imap: { ...settings.imap },
    smtp: { ...settings.smtp },
  }
}

function transport(overrides: Partial<MailTransport> = {}): MailTransport {
  return {
    list: vi.fn(async () => ({ messages: [], nextCursor: null, truncated: false })),
    read: vi.fn(async (_config, _password, request) => ({
      id: request.id, from: [{ address: 'sender@example.com' }], to: [{ address: 'user@example.com' }],
      subject: 'Delete me', receivedAt: new Date(0).toISOString(), hasAttachments: false,
      text: '', truncated: false, attachments: [],
    })),
    archive: vi.fn(async (_config, _password, request) => ({ id: request.id, mailbox: 'Archive' })),
    delete: vi.fn(async (_config, _password, request) => ({ id: request.id, deleted: true as const })),
    send: vi.fn(async () => ({ messageId: 'message-1' })),
    ...overrides,
  }
}

function execution(name: string, arguments_: unknown, cwd?: string) {
  return {
    callId: 'call-1', rootCallId: 'call-1', name, arguments: arguments_, token: Symbol(name),
    signal: new AbortController().signal,
    ...(cwd === undefined ? {} : { agent: { session: { header: { cwd } } } }),
  }
}

function managerFor(settings: MailSettings, options: { mailTransport?: MailTransport; loadAttachments?: (...args: never[]) => Promise<never[]> } = {}) {
  const scope = new FakeSettingsScope(settings)
  const tools = new FakeTools()
  const credentials = { resolve: vi.fn(async (reference: { key: string }) => ({ value: `password:${reference.key}` })) }
  const mailTransport = options.mailTransport ?? transport()
  const manager = new MailCapabilityManager(fakeContext(tools) as never, scope as never, {
    credentials: credentials as never,
    resolveConfig,
    imap: mailTransport,
    smtp: mailTransport,
    ...(options.loadAttachments === undefined ? {} : { loadAttachments: options.loadAttachments as never }),
    listMaxResults: 20,
    readMaxChars: 50_000,
    maxRecipients: 20,
    maxBodyChars: 100_000,
  })
  return { manager, scope, tools, credentials, mailTransport }
}

function toolNames(settings: MailSettings): string[] {
  const { manager, tools } = managerFor(settings)
  const names = [...tools.definitions.keys()].sort()
  void manager.dispose()
  return names
}

describe('mail capability tools', () => {
  it('registers the exact capability catalog matrix', () => {
    expect(toolNames(disabled)).toEqual([])
    expect(toolNames(imapOnly)).toEqual(['mail_archive', 'mail_list', 'mail_read'])
    expect(toolNames({ ...imapOnly, allowDelete: true })).toEqual(['mail_archive', 'mail_delete', 'mail_list', 'mail_read'])
    expect(toolNames(smtpOnly)).toEqual(['mail_send'])
  })

  it('disposes changed fibers before replacement and leaves unchanged fibers intact', async () => {
    const { manager, scope, tools } = managerFor(imapOnly)
    tools.lifecycle.length = 0

    await scope.set({ ...imapOnly, username: 'renamed@example.com' })
    expect(tools.lifecycle).toEqual([])

    await scope.set(smtpOnly)
    const firstAdd = tools.lifecycle.findIndex(event => event.startsWith('add:'))
    const lastRemove = tools.lifecycle.findLastIndex(event => event.startsWith('remove:'))
    expect(lastRemove).toBeLessThan(firstAdd)
    expect([...tools.definitions.keys()].sort()).toEqual(['mail_send'])
    await manager.dispose()
  })

  it('rechecks deletion after approval and never mutates with stale allowDelete', async () => {
    const mailTransport = transport()
    const { manager, scope, tools } = managerFor({ ...imapOnly, allowDelete: true }, { mailTransport })
    const args = { id: '42' }
    const exec = execution('mail_delete', args)
    const deleteTool = tools.definitions.get('mail_delete')!
    const policy = createMailApprovalPolicy(manager)

    expect(await policy(exec as never, vi.fn())).toMatchObject({ kind: 'ask' })
    await scope.set({ ...imapOnly, allowDelete: false })
    await expect(deleteTool.execute(args, exec)).rejects.toThrow(/disabled|unavailable/u)
    expect(mailTransport.delete).not.toHaveBeenCalled()
    await manager.dispose()
  })

  it('rechecks SMTP after approval and never sends after it is disabled', async () => {
    const mailTransport = transport()
    const { manager, scope, tools } = managerFor(smtpOnly, { mailTransport })
    const args = { to: ['to@example.com'], subject: 'Hello', text: 'Body' }
    const exec = execution('mail_send', args)
    const sendTool = tools.definitions.get('mail_send')!
    const policy = createMailApprovalPolicy(manager)

    expect(await policy(exec as never, vi.fn())).toMatchObject({ kind: 'ask' })
    await scope.set(disabled)
    await expect(sendTool.execute(args, exec)).rejects.toThrow(/disabled|unavailable/u)
    expect(mailTransport.send).not.toHaveBeenCalled()
    await manager.dispose()
  })

  it('loads attachments from the session cwd before producing approval metadata', async () => {
    const loadAttachments = vi.fn(async () => [{
      filename: 'report.pdf', contentType: 'application/pdf', content: Buffer.from('report'), size: 6,
    }])
    const { manager } = managerFor(smtpOnly, { loadAttachments: loadAttachments as never })
    const args = { to: ['to@example.com'], subject: 'Hello', text: 'Body', attachments: [{ path: 'out/report.pdf' }] }
    const exec = execution('mail_send', args, '/workspace/session')
    const policy = createMailApprovalPolicy(manager)

    const decision = await policy(exec as never, vi.fn())

    expect(loadAttachments).toHaveBeenCalledWith(args.attachments, '/workspace/session', expect.anything(), exec.signal)
    expect(decision.kind === 'ask' ? decision.reason : '').toContain('report.pdf')
    await manager.dispose()
  })

  it('fails before approval when attachments have no session cwd', async () => {
    const { manager } = managerFor(smtpOnly)
    const exec = execution('mail_send', {
      to: ['to@example.com'], subject: 'Hello', text: 'Body', attachments: [{ path: 'report.pdf' }],
    })
    const policy = createMailApprovalPolicy(manager)

    await expect(policy(exec as never, vi.fn())).rejects.toThrow(/workspace|cwd/u)
    await manager.dispose()
  })

  it('retries config capture when settings change during credential resolution', async () => {
    const scope = new FakeSettingsScope(imapOnly)
    const tools = new FakeTools()
    let releaseFirst!: () => void
    const first = new Promise<void>(resolve => { releaseFirst = resolve })
    let calls = 0
    const credentials = {
      resolve: vi.fn(async (reference: { key: string }) => {
        calls += 1
        if (calls === 1) await first
        return { value: `password:${reference.key}` }
      }),
    }
    const list = vi.fn(async () => ({ messages: [], nextCursor: null, truncated: false }))
    const mailTransport = transport({ list })
    const manager = new MailCapabilityManager(fakeContext(tools) as never, scope as never, {
      credentials: credentials as never, resolveConfig, imap: mailTransport, smtp: mailTransport,
      listMaxResults: 20, readMaxChars: 50_000, maxRecipients: 20, maxBodyChars: 100_000,
    })
    const listTool = tools.definitions.get('mail_list')!
    const running = listTool.execute({ limit: 1 }, execution('mail_list', { limit: 1 }))
    await scope.set({ ...imapOnly, passwordEnv: 'ROTATED_PASSWORD' })
    releaseFirst()

    await running
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ passwordRef: expect.objectContaining({ key: 'ROTATED_PASSWORD' }) }),
      'password:ROTATED_PASSWORD',
      expect.anything(),
      expect.anything(),
    )
    await manager.dispose()
  })
})
