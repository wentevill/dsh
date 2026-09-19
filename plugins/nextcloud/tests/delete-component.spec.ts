import { describe, expect, it, vi } from 'vitest'

function execution(name: string, arguments_: unknown) {
  return {
    callId: '1', rootCallId: '1', name, arguments: arguments_, token: Symbol(name),
    signal: new AbortController().signal, agent: { session: { header: { cwd: '/workspace' } } },
  }
}

describe('Nextcloud delete component', () => {
  it('owns only file deletion and leaves standard mutations to the main component', async () => {
    const plugin = await import('../src/tools.ts') as typeof import('../src/tools.ts') & {
      mountNextcloudDeleteComponent?: (ctx: unknown) => void
    }
    expect(plugin.mountNextcloudDeleteComponent).toBeTypeOf('function')
    if (plugin.mountNextcloudDeleteComponent === undefined) return

    const definitions = new Map<string, any>()
    const listeners = new Map<string, (...args: any[]) => unknown>()
    const service = {
      stat: vi.fn(async (path: string) => ({ path, etag: 'v1', size: 4, type: 'file' })),
      validateDeletePath: vi.fn((path: string) => path), delete: vi.fn(async () => undefined),
    }
    const ctx = {
      tools: { register: (definition: any) => { definitions.set(definition.name, definition); return () => definitions.delete(definition.name) } },
      nextcloudRuntime: { resolve: vi.fn(async () => ({ service, sharing: {}, fingerprint: 'v1' })) },
      effect: (register: () => unknown) => register(),
      on: (name: string, listener: (...args: any[]) => unknown) => { listeners.set(name, listener) },
    }

    plugin.mountNextcloudDeleteComponent(ctx)
    expect([...definitions.keys()]).toEqual(['nextcloud_delete'])
    const policy = listeners.get('tools/pre-execute')!
    const next = vi.fn(async () => ({ kind: 'allow' as const }))
    await expect(policy(execution('nextcloud_mkdir', { path: '/AI/new' }), next)).resolves.toEqual({ kind: 'allow' })
    const deletion = execution('nextcloud_delete', { path: '/AI/old' })
    await expect(policy(deletion, next)).resolves.toMatchObject({ kind: 'ask' })
    await definitions.get('nextcloud_delete').execute(deletion.arguments, deletion)
    expect(service.delete).toHaveBeenCalledWith('/AI/old', deletion.signal)
  })
})
