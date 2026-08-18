import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import MailRuntime, {
  MailError,
  type MailListRequest,
  type MailListResult,
  type MailProvider,
  type MailReadResult,
  type MailSendResult,
} from '../src/index.ts'

const message = (id: string) => ({
  id,
  from: [{ address: 'sender@example.com' }],
  to: [{ address: 'user@example.com' }],
  subject: `subject-${id}`,
  receivedAt: '2026-08-16T00:00:00.000Z',
  hasAttachments: false,
})

function provider(id: string, overrides: Partial<MailProvider> = {}): MailProvider {
  return {
    id,
    available: () => true,
    list: () => Promise.resolve({ messages: [message('1')], nextCursor: null, truncated: false }),
    read: () => Promise.resolve({ ...message('1'), text: 'body', truncated: false, attachments: [] } as MailReadResult),
    send: () => Promise.resolve({ messageId: 'sent-1' } as MailSendResult),
    ...overrides,
  }
}

async function mount(config: ConstructorParameters<typeof MailRuntime>[1] = {}) {
  const ctx = new Context()
  await ctx.plugin(MailRuntime, config)
  return { ctx, mail: ctx.mail }
}

describe('MailRuntime provider selection', () => {
  it('fails deterministically when no provider is available', async () => {
    const { mail } = await mount()
    await expect(mail.list({ limit: 10 })).rejects.toThrow(expect.objectContaining({ code: 'MAIL_PROVIDER_UNAVAILABLE' }))
  })

  it('rejects a duplicate provider id', async () => {
    const { mail } = await mount()
    mail.registerProvider(provider('single'))
    expect(() => mail.registerProvider(provider('single')))
      .toThrow(expect.objectContaining({ code: 'MAIL_DUPLICATE_PROVIDER' }))
  })

  it('does not select between multiple usable providers by registration order', async () => {
    const { mail } = await mount()
    mail.registerProvider(provider('first'))
    mail.registerProvider(provider('second'))
    await expect(mail.list({ limit: 10 })).rejects.toThrow(expect.objectContaining({ code: 'MAIL_PROVIDER_AMBIGUOUS' }))
  })

  it('uses the configured provider', async () => {
    const { mail } = await mount({ provider: 'second' })
    mail.registerProvider(provider('first', { list: () => Promise.resolve({ messages: [message('first')], nextCursor: null, truncated: false }) }))
    mail.registerProvider(provider('second', { list: () => Promise.resolve({ messages: [message('second')], nextCursor: null, truncated: false }) }))
    await expect(mail.list({ limit: 10 })).resolves.toMatchObject({ messages: [{ id: 'second' }] })
  })
})

describe('MailRuntime operation contracts', () => {
  it('caps an over-returned list and marks it truncated', async () => {
    const { mail } = await mount()
    const result: MailListResult = { messages: [message('1'), message('2'), message('3')], nextCursor: 'next', truncated: false }
    mail.registerProvider(provider('single', { list: () => Promise.resolve(result) }))
    await expect(mail.list({ limit: 2 })).resolves.toMatchObject({
      messages: [{ id: '1' }, { id: '2' }],
      nextCursor: 'next',
      truncated: true,
    })
  })

  it('passes the same abort signal to the provider', async () => {
    const { mail } = await mount()
    let seen: AbortSignal | undefined
    mail.registerProvider(provider('single', {
      list: (_request: MailListRequest, signal?: AbortSignal) => {
        seen = signal
        return Promise.resolve({ messages: [], nextCursor: null, truncated: false })
      },
    }))
    const controller = new AbortController()
    await mail.list({ limit: 1 }, controller.signal)
    expect(seen).toBe(controller.signal)
  })

  it('exposes only a stable code when wrapping a secret-bearing provider failure', () => {
    const secret = 'sentinel-app-password'
    const error = MailError.providerFailure(new Error(`authentication failed for ${secret}`))
    expect(error.code).toBe('MAIL_PROVIDER_FAILURE')
    expect(error.message).toBe('mail provider operation failed')
    expect(JSON.stringify(error)).not.toContain(secret)
  })
})
