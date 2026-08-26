import { describe, expect, it, vi } from 'vitest'
import { OcsSharingTransport } from '../src/sharing-transport.ts'

const response = (data: unknown, statuscode = 100, message = 'OK') => ({
  ok: true, status: 200, text: async () => JSON.stringify({ ocs: { meta: { status: statuscode === 100 ? 'ok' : 'failure', statuscode, message }, data } }),
})

describe('Nextcloud OCS sharing transport', () => {
  it('accepts modern OCS HTTP-style success code 200', async () => {
    const customRequest = vi.fn(async () => ({
      ok: true, status: 200,
      text: async () => JSON.stringify({ ocs: { meta: { status: 'ok', statuscode: 200, message: 'OK' }, data: [] } }),
    }))
    await expect(new OcsSharingTransport({ customRequest } as never).listShares()).resolves.toEqual([])
  })

  it('accepts a singleton array when reading one share', async () => {
    const customRequest = vi.fn(async () => response([{ id: 55735, share_type: 0, share_with: 'alice', path: '/AI/a1', permissions: 1 }]))
    await expect(new OcsSharingTransport({ customRequest } as never).getShare(55735)).resolves.toMatchObject({
      id: 55735, target: 'user', recipient: 'alice', path: '/AI/a1', profile: 'read',
    })
  })


  it('keeps Unicode sharee search parameters in the URL query', async () => {
    const customRequest = vi.fn(async () => response({ users: [] }))
    const transport = new OcsSharingTransport({ customRequest } as never, 'https://cloud.example.com/nextcloud')
    await transport.searchSharees('何金炜', 20)
    expect(customRequest.mock.calls[0]![1].url).toBe('https://cloud.example.com/nextcloud/ocs/v1.php/apps/files_sharing/api/v1/sharees?format=json&search=%E4%BD%95%E9%87%91%E7%82%9C&lookup=false&perPage=20&itemType=file')
  })

  it('creates a password-protected public share without returning the password', async () => {
    const customRequest = vi.fn(async () => response({ id: 42, share_type: 3, path: '/AI', permissions: 1, url: 'https://cloud.example.com/s/token', token: 'token', password: 'must-not-leak' }))
    const transport = new OcsSharingTransport({ customRequest } as never)
    const result = await transport.createShare({ path: '/AI', target: 'publicLink', profile: 'read', password: 'secret', expireDate: '2026-12-31', note: 'review', label: 'Q4' })
    expect(customRequest).toHaveBeenCalledWith('/ocs/v2.php/apps/files_sharing/api/v1/shares', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'OCS-APIRequest': 'true', 'Content-Type': 'application/x-www-form-urlencoded' }),
    }))
    const body = String(customRequest.mock.calls[0]![1].data)
    expect(new URLSearchParams(body).get('shareType')).toBe('3')
    expect(new URLSearchParams(body).get('password')).toBe('secret')
    expect(result).not.toHaveProperty('password')
    expect(JSON.stringify(result)).not.toContain('must-not-leak')
  })

  it('maps edit and file-drop profiles to safe permission masks', async () => {
    const customRequest = vi.fn(async () => response({ id: 1, share_type: 3, path: '/AI', permissions: 4 }))
    const transport = new OcsSharingTransport({ customRequest } as never)
    await transport.createShare({ path: '/AI', target: 'user', recipient: 'alice', profile: 'edit' })
    expect(new URLSearchParams(String(customRequest.mock.calls[0]![1].data)).get('permissions')).toBe('15')
    await transport.createShare({ path: '/AI', target: 'publicLink', profile: 'fileDrop' })
    const fileDrop = new URLSearchParams(String(customRequest.mock.calls[1]![1].data))
    expect(fileDrop.get('permissions')).toBe('4')
    expect(fileDrop.get('publicUpload')).toBe('true')
  })

  it('rejects OCS meta failures even when HTTP succeeds', async () => {
    const transport = new OcsSharingTransport({ customRequest: vi.fn(async () => response([], 403, 'public upload disabled')) } as never)
    await expect(transport.listShares()).rejects.toMatchObject({ code: 'NEXTCLOUD_OCS_403' })
  })

  it('parses local user and group sharees', async () => {
    const data = { exact: { users: [{ label: 'Alice', value: { shareWith: 'alice', shareType: 0 } }] }, groups: [{ label: 'Team', value: { shareWith: 'team', shareType: 1 } }] }
    const transport = new OcsSharingTransport({ customRequest: vi.fn(async () => response(data)) } as never)
    await expect(transport.searchSharees('a', 10)).resolves.toEqual([
      { id: 'alice', label: 'Alice', type: 'user', category: 'person' },
      { id: 'team', label: 'Team', type: 'group', category: 'department' },
    ])
  })
})
