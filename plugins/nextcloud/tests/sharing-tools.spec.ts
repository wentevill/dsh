import { describe, expect, it, vi } from 'vitest'
import { createNextcloudApprovalPolicy, NextcloudToolManager, type ServiceSnapshot } from '../src/tools.ts'

class FakeTools { definitions = new Map<string, any>(); register(value: any) { this.definitions.set(value.name, value); return () => this.definitions.delete(value.name) } }
const execution = (name: string, arguments_: unknown) => ({ callId: '1', rootCallId: '1', name, arguments: arguments_, token: Symbol(name), signal: new AbortController().signal, agent: { session: { header: { cwd: '/workspace' } } } })

function fixture() {
  const tools = new FakeTools()
  const current = { id: 7, path: '/AI', target: 'publicLink' as const, profile: 'read' as const, permissions: 1 }
  const sharing = {
    list: vi.fn(async () => ({ shares: [], truncated: false })), get: vi.fn(async () => current), searchSharees: vi.fn(async () => ({ sharees: [], truncated: false })),
    validateCreate: vi.fn(async (input: any) => ({ ...input, path: '/AI' })), create: vi.fn(async () => current),
    validateUpdate: vi.fn(async (_id: number, input: any) => ({ current, update: input })), update: vi.fn(async () => current), delete: vi.fn(async () => undefined),
  }
  const snapshot = { service: { stat: vi.fn(async (path: string) => ({ path, etag: 'v1' })) } as never, sharing: sharing as never, fingerprint: 'v1' } satisfies ServiceSnapshot
  const manager = new NextcloudToolManager({ tools } as never, vi.fn(async () => snapshot), false)
  return { tools, sharing, manager }
}

describe('Nextcloud sharing tool approval', () => {
  it('publishes discoverable enums for external shares and permission profiles', () => {
    const { tools } = fixture()
    const create = tools.definitions.get('nextcloud_share_create')
    expect(create.parameters.target).toMatchObject({ enum: ['publicLink', 'user', 'group'] })
    expect(create.parameters.profile).toMatchObject({ enum: ['read', 'edit', 'fileDrop'] })
    expect(create.description).toContain('publicLink')
    expect(tools.definitions.get('nextcloud_sharee_search').parameters.type).toMatchObject({ enum: ['all', 'user', 'group'] })
  })

  it('searches people or departments without approval', async () => {
    const { tools, sharing } = fixture()
    const exec = execution('nextcloud_sharee_search', { query: '财务', type: 'group', limit: 20 })
    await tools.definitions.get(exec.name).execute(exec.arguments, exec)
    expect(sharing.searchSharees).toHaveBeenCalledWith('财务', 20, 'group', exec.signal)
  })

  it('asks for creation without exposing the public-link password', async () => {
    const { manager } = fixture()
    const exec = execution('nextcloud_share_create', { path: '/AI', target: 'publicLink', profile: 'read', password: 'top-secret', expireDate: '2026-12-31' })
    const decision = await createNextcloudApprovalPolicy(manager)(exec as never, vi.fn())
    expect(decision).toMatchObject({ kind: 'ask' })
    expect(JSON.stringify(decision)).toContain('password will be set')
    expect(JSON.stringify(decision)).not.toContain('top-secret')
  })

  it('normalizes common external-share aliases before validation and creation', async () => {
    const { tools, sharing, manager } = fixture()
    const exec = execution('nextcloud_share_create', { path: '/AI', target: 'external', profile: 'readonly' })
    await expect(createNextcloudApprovalPolicy(manager)(exec as never, vi.fn())).resolves.toMatchObject({ kind: 'ask' })
    expect(sharing.validateCreate).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/AI', target: 'publicLink', profile: 'read' }),
      exec.signal,
    )
    await tools.definitions.get(exec.name).execute(exec.arguments, exec)
    expect(sharing.create).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/AI', target: 'publicLink', profile: 'read' }),
      exec.signal,
    )
  })

  it('rechecks the current share before update execution', async () => {
    const { tools, sharing, manager } = fixture()
    const exec = execution('nextcloud_share_update', { shareId: 7, profile: 'edit' })
    await createNextcloudApprovalPolicy(manager)(exec as never, vi.fn())
    sharing.get.mockResolvedValueOnce({ id: 7, path: '/AI', target: 'publicLink', profile: 'edit', permissions: 15 })
    await expect(tools.definitions.get(exec.name).execute(exec.arguments, exec)).resolves.toContain('remote share changed')
    expect(sharing.update).not.toHaveBeenCalled()
  })

  it('requires approval before revoking a share', async () => {
    const { tools, sharing, manager } = fixture()
    const exec = execution('nextcloud_share_delete', { shareId: 7 })
    await expect(createNextcloudApprovalPolicy(manager)(exec as never, vi.fn())).resolves.toMatchObject({ kind: 'ask' })
    await tools.definitions.get(exec.name).execute(exec.arguments, exec)
    expect(sharing.delete).toHaveBeenCalledWith(7, exec.signal)
  })

  it('returns approval-time path validation failures as normal tool output', async () => {
    const { tools, sharing, manager } = fixture()
    sharing.validateCreate.mockRejectedValueOnce(new Error('Nextcloud path is outside configured roots'))
    const exec = execution('nextcloud_share_create', { path: '/outside', target: 'user', recipient: 'alice', profile: 'read' })
    await expect(createNextcloudApprovalPolicy(manager)(exec as never, vi.fn())).resolves.toEqual({ kind: 'allow' })
    const result = await tools.definitions.get(exec.name).execute(exec.arguments, exec)
    expect(result).toContain('"ok": false')
    expect(result).toContain('NEXTCLOUD_INVALID_INPUT')
    expect(sharing.create).not.toHaveBeenCalled()
  })
})
