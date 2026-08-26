import { describe, expect, it, vi } from 'vitest'
import { NextcloudSharingService } from '../src/sharing-service.ts'

const share = { id: 1, path: '/AI', target: 'publicLink' as const, profile: 'read' as const, permissions: 1 }
function fixture(type: 'file' | 'directory' = 'directory') {
  const transport = {
    listShares: vi.fn(async () => [share, { ...share, id: 2 }, { ...share, id: 3 }]), getShare: vi.fn(async () => share),
    searchSharees: vi.fn(async () => []), createShare: vi.fn(async (input: any) => ({ ...share, ...input })),
    updateShare: vi.fn(async () => share), deleteShare: vi.fn(async () => undefined),
  }
  const files = { stat: vi.fn(async (path: string) => ({ path, type, etag: 'v1' })) }
  const service = new NextcloudSharingService(transport, files as never, { accessMode: 'allowlist', allowedRoots: ['/AI'] })
  return { service, transport, files }
}

describe('Nextcloud sharing service', () => {
  it('enforces allowed roots and bounds share results', async () => {
    const { service, transport } = fixture()
    await expect(service.list({ path: '/outside' })).rejects.toThrow(/outside configured roots/u)
    await expect(service.list({ limit: 2 })).resolves.toEqual({ shares: [share, { ...share, id: 2 }], truncated: true })
    expect(transport.listShares).toHaveBeenCalledWith('/AI', undefined)
  })

  it('filters sharees as people or departments', async () => {
    const { service, transport } = fixture()
    transport.searchSharees.mockResolvedValue([
      { id: 'alice', label: 'Alice', type: 'user', category: 'person' },
      { id: 'finance', label: 'Finance', type: 'group', category: 'department' },
    ])
    await expect(service.searchSharees('fin', 10, 'group')).resolves.toEqual({
      sharees: [{ id: 'finance', label: 'Finance', type: 'group', category: 'department' }], truncated: false,
    })
    await expect(service.searchSharees('ali', 10, 'user')).resolves.toEqual({
      sharees: [{ id: 'alice', label: 'Alice', type: 'user', category: 'person' }], truncated: false,
    })
    await expect(service.searchSharees('x', 10, 'team' as never)).rejects.toThrow(/sharee type/u)
  })

  it('accepts real calendar dates and rejects impossible dates', async () => {
    const { service } = fixture()
    await expect(service.validateCreate({ path: '/AI', target: 'publicLink', profile: 'read', expireDate: '2026-02-28' })).resolves.toMatchObject({ expireDate: '2026-02-28' })
    await expect(service.validateCreate({ path: '/AI', target: 'publicLink', profile: 'read', expireDate: '2026-02-30' })).rejects.toThrow(/expiration date/u)
  })

  it('requires recipients only for users and groups', async () => {
    const { service } = fixture()
    await expect(service.validateCreate({ path: '/AI', target: 'user', profile: 'read' })).rejects.toThrow(/recipient/u)
    await expect(service.validateCreate({ path: '/AI', target: 'publicLink', recipient: 'alice', profile: 'read' })).rejects.toThrow(/recipient/u)
  })

  it('rejects unknown target and permission profile values at the tool boundary', async () => {
    const { service } = fixture()
    await expect(service.validateCreate({ path: '/AI', target: 'email' as never, profile: 'read' })).rejects.toThrow(/share target/u)
    await expect(service.validateCreate({ path: '/AI', target: 'publicLink', profile: 'owner' as never })).rejects.toThrow(/share profile/u)
  })

  it('allows File Drop only for public directory links', async () => {
    await expect(fixture().service.validateCreate({ path: '/AI', target: 'publicLink', profile: 'fileDrop' })).resolves.toMatchObject({ profile: 'fileDrop' })
    await expect(fixture().service.validateCreate({ path: '/AI', target: 'group', recipient: 'team', profile: 'fileDrop' })).rejects.toThrow(/File Drop/u)
    await expect(fixture('file').service.validateCreate({ path: '/AI/file.txt', target: 'publicLink', profile: 'fileDrop' })).rejects.toThrow(/directory/u)
  })

  it('never returns a submitted password', async () => {
    const { service } = fixture()
    const result = await service.create({ path: '/AI', target: 'publicLink', profile: 'read', password: 'secret' })
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})
