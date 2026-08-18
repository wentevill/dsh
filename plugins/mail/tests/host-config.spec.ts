import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-credentials', () => ({
  credentialRef: (key: string) => ({ provider: 'env', key }),
}))
vi.mock('@deepseek-ai/dsh-mail', () => ({
  MailError: class MailError extends Error {
    static providerFailure(error: unknown) { return error }
  },
}))
vi.mock('@deepseek-ai/dsh-settings', () => ({ settingsNamespace: (name: string) => name }))
vi.mock('@deepseek-ai/dsh-tools', () => ({ defineTool: <T>(tool: T) => tool }))
vi.mock('@deepseek-ai/dsh-typert-protocol', () => ({
  Remote: () => () => undefined,
  TypertRemoteService: class {},
}))

const disabledEndpoints = {
  username: 'user@example.com',
  imap: { host: '', port: 993, secure: true },
  smtp: { host: '', port: 465, secure: true },
}

async function boot(config: typeof disabledEndpoints): Promise<void> {
  const mail = await import('../lib/index.js')
  const ctx = {
    credentials: { resolve: async () => undefined },
    tools: { register: () => undefined },
    systemPrompt: { section: () => undefined },
    on: () => undefined,
    inject: () => undefined,
  }
  mail.apply(ctx as never, config)
}

describe('mail Host configuration', () => {
  it('boots the shipped disabled endpoint defaults', async () => {
    await expect(boot(disabledEndpoints)).resolves.toBeUndefined()
  })

  it('still rejects insecure and invalid configured endpoints', async () => {
    await expect(boot({
      ...disabledEndpoints,
      imap: { host: 'imap.test', port: 993, secure: false },
    })).rejects.toThrow('IMAP must use TLS')
    await expect(boot({
      ...disabledEndpoints,
      smtp: { host: 'smtp.test', port: 0, secure: true },
    })).rejects.toThrow('SMTP port must be between 1 and 65535')
  })

  it('keeps IMAP-only and SMTP-only settings independent of bootstrap', async () => {
    const mail = await import('../lib/index.js')
    const resolveEffectiveConfig = (mail as typeof mail & {
      resolveEffectiveConfig: (bootstrap: unknown, settings: unknown) => unknown
    }).resolveEffectiveConfig
    const bootstrap = {
      username: 'bootstrap@example.com', passwordRef: { provider: 'env', key: 'MAIL_APP_PASSWORD' },
      mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: false,
      imap: { host: '', port: 993, secure: true }, smtp: { host: '', port: 465, secure: true },
    }
    const imapOnly = {
      username: 'imap@example.com', passwordEnv: 'IMAP_PASSWORD', mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: true,
      imap: { host: 'imap.test', port: 993, secure: true }, smtp: { host: '', port: 465, secure: true },
    }
    const smtpOnly = {
      ...imapOnly,
      username: 'smtp@example.com', passwordEnv: 'SMTP_PASSWORD', allowDelete: false,
      imap: { host: '', port: 993, secure: true }, smtp: { host: 'smtp.test', port: 465, secure: true },
    }

    expect(resolveEffectiveConfig(bootstrap, imapOnly)).toMatchObject({
      username: 'imap@example.com', imap: imapOnly.imap, smtp: imapOnly.smtp, allowDelete: true,
    })
    expect(resolveEffectiveConfig(bootstrap, smtpOnly)).toMatchObject({
      username: 'smtp@example.com', imap: smtpOnly.imap, smtp: smtpOnly.smtp, allowDelete: false,
    })
  })

  it('rejects unsafe configured endpoints from settings before they become effective', async () => {
    const mail = await import('../lib/index.js')
    const resolveEffectiveConfig = (mail as typeof mail & {
      resolveEffectiveConfig: (bootstrap: unknown, settings: unknown) => unknown
    }).resolveEffectiveConfig
    const bootstrap = {
      username: 'bootstrap@example.com', passwordRef: { provider: 'env', key: 'MAIL_APP_PASSWORD' },
      mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: false,
      imap: { host: '', port: 993, secure: true }, smtp: { host: '', port: 465, secure: true },
    }
    const settings = {
      username: 'user@example.com', passwordEnv: 'MAIL_APP_PASSWORD', mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: false,
      imap: { host: 'imap.test', port: 993, secure: true }, smtp: { host: 'smtp.test', port: 465, secure: true },
    }

    expect(() => resolveEffectiveConfig(bootstrap, {
      ...settings, imap: { ...settings.imap, secure: false },
    })).toThrow('IMAP must use TLS')
    expect(() => resolveEffectiveConfig(bootstrap, {
      ...settings, smtp: { ...settings.smtp, port: 0 },
    })).toThrow('SMTP port must be between 1 and 65535')
  })
})
