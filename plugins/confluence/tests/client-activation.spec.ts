import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ IconChevronDownOutline14: () => null }))

describe('Confluence client activation', () => {
  it('renders its registered settings contribution with the current Remote credential service', async () => {
    const { apply, inject } = await import('../src/client/index.tsx')
    const ctx = new Context()
    let component: ((props: { t: (key: string) => string }) => unknown) | undefined
    const confluenceSettings = {
      load: async () => ({ ok: true, value: { settings: { baseUrl: '', allowAllSpaces: false, allowedSpaceKeys: [] } } }),
    }
    const credentials = { set: async () => ({ ok: true, value: undefined }) }
    const remote = { confluenceSettings, credentials, $mount: async () => async () => undefined }
    ctx.provide('remote', remote)
    ctx.provide('remote.confluenceSettings', confluenceSettings)
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
      storeConfluenceCredential(credentials: unknown, ref: string, value: string): Promise<void>
    }
    let received: unknown[] = []
    const credentials = {
      set: async (...args: unknown[]) => { received = args; return { ok: true as const, value: undefined } },
    }

    await client.storeConfluenceCredential(credentials, 'CONFLUENCE_PAT_EXAMPLE', 'secret')

    expect(received).toEqual(['CONFLUENCE_PAT_EXAMPLE', 'secret'])
  })

  it('surfaces credential Remote failures', async () => {
    const { storeConfluenceCredential } = await import('../src/client/index.tsx')
    const credentials = {
      set: async () => ({ ok: false as const, error: { message: 'credential rejected' } }),
    }

    await expect(storeConfluenceCredential(credentials, 'CONFLUENCE_PAT_EXAMPLE', 'secret'))
      .rejects.toThrow('credential rejected')
  })
})
