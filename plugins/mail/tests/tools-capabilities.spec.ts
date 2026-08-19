import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { ToolRegistry } from '@deepseek-ai/dsh-tools'
import type { MailSettings } from '../src/mail-settings.ts'
import type { MailTransport, ResolvedConfig } from '../src/index.ts'
import { createMailApprovalPolicy } from '../src/approval.ts'
import { MailError, mailError } from '../src/errors.ts'
import { MailCapabilityManager } from '../src/tools.ts'

vi.mock('@deepseek-ai/dsh-mail', () => ({
  MailError: class MailError extends Error {
    constructor(message: string, readonly code?: string) { super(message) }
    static providerFailure(_error: unknown) { return new Error('MAIL_PROVIDER_FAILURE: mail provider operation failed') }
  },
}))

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
  setAuthoritative(next: MailSettings): void { this.value = next }
  callbacks(): Array<(next: MailSettings, prev: MailSettings) => void | Promise<void>> { return [...this.watchers] }
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
    maxRecipients: 100,
    maxTextChars: 500_000,
    maxHtmlChars: 1_000_000,
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
    await expect(deleteTool.execute(args, exec)).rejects.toThrow(/disabled|unavailable|settings changed|fresh/u)
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
    await expect(sendTool.execute(args, exec)).rejects.toThrow(/disabled|unavailable|settings changed|fresh/u)
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
    expect(manager.approvalBindingCountForTests()).toBe(1)
    expect(manager.approvalListenerCountForTests()).toBe(1)
    manager.releaseApproval(exec as never)
    expect(manager.approvalBindingCountForTests()).toBe(0)
    expect(manager.approvalListenerCountForTests()).toBe(0)
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
      listMaxResults: 20, readMaxChars: 50_000, maxRecipients: 100, maxTextChars: 500_000, maxHtmlChars: 1_000_000,
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

  it('rejects deletion when authoritative account changes before its watcher runs', async () => {
    const mailTransport = transport()
    const { manager, scope, tools } = managerFor({ ...imapOnly, allowDelete: true }, { mailTransport })
    const args = { id: '42' }
    const exec = execution('mail_delete', args)
    const deleteTool = tools.definitions.get('mail_delete')!
    expect(await createMailApprovalPolicy(manager)(exec as never, vi.fn())).toMatchObject({ kind: 'ask' })

    scope.setAuthoritative({ ...imapOnly, username: 'other@example.com', mailbox: 'Other', allowDelete: true })
    await expect(deleteTool.execute(args, exec)).rejects.toThrow(/settings changed|fresh/u)
    expect(mailTransport.delete).not.toHaveBeenCalled()
    expect(manager.approvalBindingCountForTests()).toBe(0)
    await manager.dispose()
  })

  it('invalidates disable and re-enable even when the final values match', async () => {
    const original = { ...imapOnly, allowDelete: true }
    const { manager, scope, tools, mailTransport } = managerFor(original)
    const args = { id: '42' }
    const exec = execution('mail_delete', args)
    const deleteTool = tools.definitions.get('mail_delete')!
    await createMailApprovalPolicy(manager)(exec as never, vi.fn())
    scope.setAuthoritative({ ...original, imap: { ...original.imap } })

    await expect(deleteTool.execute(args, exec)).rejects.toThrow(/settings changed|fresh/u)
    expect(mailTransport.delete).not.toHaveBeenCalled()
    await manager.dispose()
  })

  it('invalidates approval when a settings provider mutates its snapshot in place', async () => {
    const original = { ...imapOnly, allowDelete: true }
    const { manager, tools, mailTransport } = managerFor(original)
    const args = { id: '42' }
    const exec = execution('mail_delete', args)
    const deleteTool = tools.definitions.get('mail_delete')!
    await createMailApprovalPolicy(manager)(exec as never, vi.fn())
    original.username = 'mutated@example.com'

    await expect(deleteTool.execute(args, exec)).rejects.toThrow(/settings changed|fresh/u)
    expect(mailTransport.delete).not.toHaveBeenCalled()
    await manager.dispose()
  })

  it('reloads attachments after approval and rejects same-size changed bytes by digest', async () => {
    const loadAttachments = vi.fn()
      .mockResolvedValueOnce([{ filename: 'report.pdf', contentType: 'application/pdf', content: Buffer.from('one'), size: 3 }])
      .mockResolvedValueOnce([{ filename: 'report.pdf', contentType: 'application/pdf', content: Buffer.from('two'), size: 3 }])
    const { manager, tools, mailTransport } = managerFor(smtpOnly, { loadAttachments })
    const args = { to: ['to@example.com'], subject: 'Hello', text: 'SECRET BODY', bcc: ['hidden@example.com'], attachments: [{ path: 'report.pdf' }] }
    const exec = execution('mail_send', args, '/workspace/session')
    const sendTool = tools.definitions.get('mail_send')!
    const decision = await createMailApprovalPolicy(manager)(exec as never, vi.fn())
    const reason = decision.kind === 'ask' ? decision.reason ?? '' : ''
    expect(reason).not.toContain('SECRET BODY')
    expect(reason).not.toContain('hidden@example.com')
    expect(reason).toContain('2 total')

    await expect(sendTool.execute(args, exec)).rejects.toThrow(/attachments changed/u)
    expect(mailTransport.send).not.toHaveBeenCalled()
    expect(manager.approvalBindingCountForTests()).toBe(0)
    expect(manager.approvalListenerCountForTests()).toBe(0)
    await manager.dispose()
  })

  it('removes abort listeners after completion, cancellation, and disposal', async () => {
    const loadAttachments = vi.fn(async () => [{
      filename: 'report.pdf', contentType: 'application/pdf', content: Buffer.from('same'), size: 4,
    }])
    const first = managerFor(smtpOnly, { loadAttachments })
    const args = { to: ['to@example.com'], subject: 'Hello', text: 'Body', attachments: [{ path: 'report.pdf' }] }
    const exec = execution('mail_send', args, '/workspace/session')
    await createMailApprovalPolicy(first.manager)(exec as never, vi.fn())
    await first.tools.definitions.get('mail_send')!.execute(args, exec)
    expect(first.manager.approvalListenerCountForTests()).toBe(0)
    await first.manager.dispose()

    const second = managerFor(smtpOnly)
    const controller = new AbortController()
    const cancelled = { ...execution('mail_send', { to: ['to@example.com'], subject: 'Hello', text: 'Body' }), signal: controller.signal }
    await createMailApprovalPolicy(second.manager)(cancelled as never, vi.fn())
    expect(second.manager.approvalListenerCountForTests()).toBe(1)
    controller.abort()
    expect(second.manager.approvalBindingCountForTests()).toBe(0)
    expect(second.manager.approvalListenerCountForTests()).toBe(0)

    const pending = execution('mail_send', { to: ['to@example.com'], subject: 'Hello', text: 'Body' })
    await createMailApprovalPolicy(second.manager)(pending as never, vi.fn())
    await second.manager.dispose()
    expect(second.manager.approvalBindingCountForTests()).toBe(0)
    expect(second.manager.approvalListenerCountForTests()).toBe(0)
  })

  it('cannot reinstall a tool from a watcher callback that completes after disposal', async () => {
    const scope = new FakeSettingsScope(disabled)
    const tools = new FakeTools()
    const manager = managerFor(disabled).manager
    await manager.dispose()

    const isolated = new MailCapabilityManager(fakeContext(tools) as never, scope as never, {
      credentials: { resolve: vi.fn() } as never, resolveConfig, imap: transport(), smtp: transport(),
      listMaxResults: 20, readMaxChars: 50_000, maxRecipients: 100, maxTextChars: 500_000, maxHtmlChars: 1_000_000,
    })
    const callbacks = scope.callbacks()
    await isolated.dispose()
    scope.setAuthoritative(smtpOnly)
    await callbacks[0]?.(smtpOnly, disabled)
    expect(tools.definitions.size).toBe(0)
  })

  it('fails approval closed while tool teardown is still in flight', async () => {
    const scope = new FakeSettingsScope(smtpOnly)
    const tools = new FakeTools()
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const context = {
      tools,
      effect(execute: () => Iterable<() => unknown>) {
        const disposers = [...execute()]
        return async () => {
          await blocked
          for (const dispose of disposers.reverse()) await dispose()
        }
      },
    }
    const manager = new MailCapabilityManager(context as never, scope as never, {
      credentials: { resolve: vi.fn(async () => ({ value: 'password' })) } as never,
      resolveConfig, imap: transport(), smtp: transport(),
      listMaxResults: 20, readMaxChars: 50_000, maxRecipients: 100, maxTextChars: 500_000, maxHtmlChars: 1_000_000,
    })
    const disposing = manager.dispose()
    expect(tools.definitions.has('mail_send')).toBe(true)
    await expect(createMailApprovalPolicy(manager)(execution('mail_send', {
      to: ['to@example.com'], subject: 'Hello', text: 'Body',
    }) as never, vi.fn(async () => ({ kind: 'allow' as const })))).rejects.toThrow(/unavailable/u)
    release()
    await disposing
    expect(tools.definitions.size).toBe(0)
  })

  it('sanitizes credential and transport provider failures, including structured spoofs', async () => {
    const secret = 'sentinel-password'
    const scope = new FakeSettingsScope(imapOnly)
    const tools = new FakeTools()
    const manager = new MailCapabilityManager(fakeContext(tools) as never, scope as never, {
      credentials: { resolve: vi.fn(async () => { throw mailError(`credential ${secret}`, 'MAIL_UID_INVALID') }) } as never,
      resolveConfig, imap: transport(), smtp: transport(),
      listMaxResults: 20, readMaxChars: 50_000, maxRecipients: 100, maxTextChars: 500_000, maxHtmlChars: 1_000_000,
    })
    const listTool = tools.definitions.get('mail_list')!
    const credentialError = await listTool.execute({ limit: 1 }, execution('mail_list', { limit: 1 })).catch(error => error as Error)
    expect(credentialError).toMatchObject({ code: 'MAIL_PROVIDER_FAILURE' })
    expect(credentialError.message).not.toContain(secret)
    await manager.dispose()

    for (const spoofed of [
      new HarnessError(`provider ${secret}`, 'MAIL_UID_INVALID'),
      new MailError(`provider ${secret}`, 'MAIL_ARCHIVE_MAILBOX_UNAVAILABLE'),
    ]) {
      const failing = transport({ list: vi.fn(async () => { throw spoofed }) })
      const next = managerFor(imapOnly, { mailTransport: failing })
      const providerError = await next.tools.definitions.get('mail_list')!.execute(
        { limit: 1 }, execution('mail_list', { limit: 1 }),
      ).catch(error => error as Error)
      expect(providerError).toMatchObject({ code: 'MAIL_PROVIDER_FAILURE' })
      expect(providerError.message).not.toContain(secret)
      await next.manager.dispose()
    }
  })

  it('preserves Mail-owned validation and capability codes outside provider calls', async () => {
    const first = managerFor(imapOnly)
    await expect(first.tools.definitions.get('mail_read')!.execute(
      { id: '1:*' }, execution('mail_read', { id: '1:*' }),
    )).rejects.toMatchObject({ code: 'MAIL_UID_INVALID' })
    await first.manager.dispose()

    const missingUsername = managerFor({ ...imapOnly, username: '' })
    await expect(missingUsername.tools.definitions.get('mail_list')!.execute(
      { limit: 1 }, execution('mail_list', { limit: 1 }),
    )).rejects.toMatchObject({ code: 'MAIL_USERNAME_UNAVAILABLE' })
    await missingUsername.manager.dispose()

    const unavailable = managerFor(disabled)
    await expect(unavailable.manager.prepareSend(execution('mail_send', {
      to: ['to@example.com'], subject: 'subject', text: 'body',
    }) as never)).rejects.toMatchObject({ code: 'MAIL_SMTP_DISABLED' })
    await unavailable.manager.dispose()
  })

  it('surfaces Mail validation codes through an actual ToolRegistry result', async () => {
    const ctx = new Context()
    ctx.provide('systemPrompt', { tools: () => () => undefined, section: () => () => undefined } as never)
    const registry = new ToolRegistry(ctx as never)
    const scope = new FakeSettingsScope(imapOnly)
    const manager = new MailCapabilityManager({
      tools: registry,
      effect(execute: () => Iterable<() => unknown>) {
        const disposers = [...execute()]
        return async () => { for (const dispose of disposers.reverse()) await dispose() }
      },
    } as never, scope as never, {
      credentials: { resolve: vi.fn(async () => ({ value: 'password' })) } as never,
      resolveConfig, imap: transport(), smtp: transport(),
      listMaxResults: 20, readMaxChars: 50_000, maxRecipients: 100, maxTextChars: 500_000, maxHtmlChars: 1_000_000,
    })

    const result = await registry.execute({
      callId: 'structured-mail-error' as never,
      name: 'mail_read', arguments: { id: '1:*' }, signal: new AbortController().signal,
    })

    expect(result).toMatchObject({
      isError: true,
      error: { info: { name: 'MailError', code: 'MAIL_UID_INVALID' } },
    })
    await manager.dispose()
  })

  it('allows exact default recipient and split body limits and rejects boundary plus one', async () => {
    const { manager } = managerFor(smtpOnly)
    const base = { to: Array.from({ length: 100 }, (_, index) => `recipient-${index}@example.com`), subject: 'Limits' }
    const exact = execution('mail_send', { ...base, text: 't'.repeat(500_000), html: 'h'.repeat(1_000_000) })
    await expect(manager.prepareSend(exact as never)).resolves.toMatchObject({ formats: ['text', 'html'] })
    manager.releaseApproval(exact as never)

    await expect(manager.prepareSend(execution('mail_send', {
      ...base, text: 't'.repeat(500_001),
    }) as never)).rejects.toMatchObject({ code: 'MAIL_BODY_TOO_LARGE' })
    await expect(manager.prepareSend(execution('mail_send', {
      ...base, html: 'h'.repeat(1_000_001),
    }) as never)).rejects.toMatchObject({ code: 'MAIL_BODY_TOO_LARGE' })
    await expect(manager.prepareSend(execution('mail_send', {
      ...base, to: [...base.to, 'overflow@example.com'], text: 'body',
    }) as never)).rejects.toMatchObject({ code: 'MAIL_RECIPIENT_LIMIT_EXCEEDED' })
    await manager.dispose()
  })

  it('does not call transport when disposal wins during credential resolution', async () => {
    let release!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const scope = new FakeSettingsScope(imapOnly)
    const tools = new FakeTools()
    const list = vi.fn(async () => ({ messages: [], nextCursor: null, truncated: false }))
    const mailTransport = transport({ list })
    const manager = new MailCapabilityManager(fakeContext(tools) as never, scope as never, {
      credentials: { resolve: vi.fn(async () => { await blocked; return { value: 'password' } }) } as never,
      resolveConfig, imap: mailTransport, smtp: mailTransport,
      listMaxResults: 20, readMaxChars: 50_000, maxRecipients: 100, maxTextChars: 500_000, maxHtmlChars: 1_000_000,
    })
    const running = tools.definitions.get('mail_list')!.execute({ limit: 1 }, execution('mail_list', { limit: 1 }))
    const disposing = manager.dispose()
    release()
    await expect(running).rejects.toThrow(/unavailable/u)
    await disposing
    expect(list).not.toHaveBeenCalled()
  })
})
