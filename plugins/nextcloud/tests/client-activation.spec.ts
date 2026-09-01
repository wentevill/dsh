import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply, inject, storeNextcloudCredential } from '../src/client/index.tsx'

describe('Nextcloud client activation', () => {
  it('renders its registered settings contribution with the current Remote credential service', async () => {
    const ctx = new Context()
    let component: ((props: { t: (key: string) => string }) => unknown) | undefined
    const settings = {
      serverUrl: '', username: '', accessMode: 'all' as const, allowedRoots: [],
      allowDelete: false, allowHttp: false, skipTlsVerify: false,
    }
    const nextcloudSettings = { load: async () => ({ ok: true, value: { settings } }) }
    const credentials = { set: async () => ({ ok: true, value: undefined }) }
    const remote = { nextcloudSettings, credentials, $mount: async () => async () => undefined }
    ctx.provide('remote', remote)
    ctx.provide('remote.nextcloudSettings', nextcloudSettings)
    ctx.provide('remote.credentials', credentials)
    ctx.provide('locale', { register: () => () => undefined })
    ctx.provide('slots', {
      register(_options: unknown, contribution: typeof component) {
        component = contribution
        return () => undefined
      },
      inject(_name: string, register: () => Iterable<() => void>) {
        const disposers = [...register()]
        return () => { for (const dispose of disposers.reverse()) dispose() }
      },
    })

    const fiber = ctx.plugin({ inject, apply })
    await fiber.await()
    expect(component).toBeTypeOf('function')
    expect(() => component?.({ t: key => key })).not.toThrow()
    await fiber.dispose()
    await ctx.fiber.dispose()
  })

  it('writes credentials through the current positional Remote contract', async () => {
    const client = await import('../src/client/index.tsx') as typeof import('../src/client/index.tsx') & {
      storeNextcloudCredential(credentials: unknown, value: string): Promise<void>
    }
    let received: unknown[] = []
    const credentials = {
      set: async (...args: unknown[]) => { received = args; return { ok: true as const, value: undefined } },
    }

    await client.storeNextcloudCredential(credentials, 'secret')

    expect(received).toEqual(['NEXTCLOUD_APP_PASSWORD', 'secret'])
  })

  it('surfaces credential Remote failures', async () => {
    const credentials = {
      set: async () => ({ ok: false as const, error: { message: 'credential rejected' } }),
    }

    await expect(storeNextcloudCredential(credentials, 'secret'))
      .rejects.toThrow('credential rejected')
  })
})
