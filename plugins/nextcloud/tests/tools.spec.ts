import { describe, expect, it, vi } from 'vitest'
import { createNextcloudApprovalPolicy, NextcloudToolManager, type ServiceSnapshot } from '../src/tools.ts'

class FakeTools {
  readonly definitions = new Map<string, any>()
  register(definition: any) { this.definitions.set(definition.name, definition); return () => this.definitions.delete(definition.name) }
}

function execution(name: string, arguments_: unknown, cwd = '/workspace') {
  return { callId: '1', rootCallId: '1', name, arguments: arguments_, token: Symbol(name), signal: new AbortController().signal, agent: { session: { header: { cwd } } } }
}

function fixture(allowDelete = false) {
  const tools = new FakeTools()
  const service = {
    list: vi.fn(async () => ({ entries: [], truncated: false })), stat: vi.fn(async (path: string) => ({ path, etag: 'v1', size: 4, type: 'file' })),
    search: vi.fn(async () => ({ entries: [], truncated: false })), read: vi.fn(async () => ({ kind: 'text', text: 'body' })),
    download: vi.fn(async () => ({ localPath: '.nextcloud-downloads/a.txt' })), upload: vi.fn(async () => ({ remotePath: '/AI/a.txt', size: 4, sha256: 'hash' })),
    mkdir: vi.fn(async () => undefined), move: vi.fn(async () => undefined), delete: vi.fn(async () => undefined),
    validateUploadPath: vi.fn((path: string) => path),
    validateMovePaths: vi.fn((source: string, destination: string) => ({ source, destination })),
    validateDeletePath: vi.fn((path: string) => path),
  }
  const sharing = {
    list: vi.fn(async () => ({ shares: [], truncated: false })), get: vi.fn(async (id: number) => ({ id, path: '/AI', target: 'publicLink', profile: 'read', permissions: 1 })),
    searchSharees: vi.fn(async () => ({ sharees: [], truncated: false })), validateCreate: vi.fn(async (input: any) => input), create: vi.fn(async () => ({ id: 1 })),
    validateUpdate: vi.fn(async (_id: number, input: any) => ({ current: { id: 1, path: '/AI', target: 'publicLink', profile: 'read', permissions: 1 }, update: input })),
    update: vi.fn(async () => ({ id: 1 })), delete: vi.fn(async () => undefined),
  }
  let fingerprint = 'settings:v1'
  const resolve = vi.fn(async (): Promise<ServiceSnapshot> => ({ service: service as never, sharing: sharing as never, fingerprint }))
  const manager = new NextcloudToolManager({ tools } as never, resolve, allowDelete)
  return { tools, service, sharing, manager, resolve, changeFingerprint: () => { fingerprint = 'settings:v2' } }
}

describe('Nextcloud tools and approval', () => {
  it('registers the read/write catalog and gates delete on settings', () => {
    expect([...fixture(false).tools.definitions.keys()].sort()).toEqual([
      'nextcloud_download', 'nextcloud_list', 'nextcloud_mkdir', 'nextcloud_move',
      'nextcloud_read', 'nextcloud_search', 'nextcloud_share_create', 'nextcloud_share_delete',
      'nextcloud_share_get', 'nextcloud_share_list', 'nextcloud_share_update', 'nextcloud_sharee_search',
      'nextcloud_stat', 'nextcloud_upload',
    ])
    expect([...fixture(true).tools.definitions.keys()].sort()).toContain('nextcloud_delete')
  })

  it('delegates read-only tools and asks freshly for every remote mutation', async () => {
    const { manager, tools, service } = fixture(true)
    const policy = createNextcloudApprovalPolicy(manager)
    const next = vi.fn(async () => ({ kind: 'allow' as const }))
    expect(await policy(execution('nextcloud_list', {}) as never, next)).toEqual({ kind: 'allow' })
    const listExec = execution('nextcloud_list', {})
    await tools.definitions.get('nextcloud_list').execute(listExec.arguments, listExec)
    expect(service.list).toHaveBeenCalledWith(undefined, undefined, listExec.signal)
    for (const [name, args] of [
      ['nextcloud_mkdir', { path: '/AI/new' }],
      ['nextcloud_move', { source: '/AI/a', destination: '/AI/b' }],
      ['nextcloud_delete', { path: '/AI/a' }],
    ] as const) {
      expect(await policy(execution(name, args) as never, next)).toMatchObject({ kind: 'ask' })
    }
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('rejects a write when settings or credentials changed after approval', async () => {
    const { tools, manager, service, changeFingerprint } = fixture()
    const exec = execution('nextcloud_mkdir', { path: '/AI/new' })
    const policy = createNextcloudApprovalPolicy(manager)
    expect(await policy(exec as never, vi.fn())).toMatchObject({ kind: 'ask' })
    changeFingerprint()
    await expect(tools.definitions.get('nextcloud_mkdir').execute(exec.arguments, exec)).resolves.toContain('fresh approval')
    expect(service.mkdir).not.toHaveBeenCalled()
  })

  it('consumes a valid approval exactly once before mutating', async () => {
    const { tools, manager, service } = fixture()
    const exec = execution('nextcloud_mkdir', { path: '/AI/new' })
    await createNextcloudApprovalPolicy(manager)(exec as never, vi.fn())
    await tools.definitions.get('nextcloud_mkdir').execute(exec.arguments, exec)
    expect(service.mkdir).toHaveBeenCalledWith('/AI/new', exec.signal)
    await expect(tools.definitions.get('nextcloud_mkdir').execute(exec.arguments, exec)).resolves.toContain('fresh approval')
  })

  it('returns recoverable read failures as tool output', async () => {
    const { tools, service } = fixture()
    service.list.mockRejectedValueOnce(new Error('Nextcloud path is outside configured roots'))
    const exec = execution('nextcloud_list', { path: '/outside' })
    await expect(tools.definitions.get(exec.name).execute(exec.arguments, exec)).resolves.toContain('"ok": false')
    await expect(tools.definitions.get(exec.name).execute(exec.arguments, exec)).resolves.not.toContain('Tool call Error')
  })
})
