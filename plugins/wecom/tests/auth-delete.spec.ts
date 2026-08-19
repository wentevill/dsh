import { describe, expect, it } from 'vitest'
import { deleteOwnedAuthorization } from '../src/auth-files.ts'

describe('WeCom owned authorization deletion', () => {
  it('deletes only the exact credential, fallback key, and discovery cache targets', async () => {
    const calls: Array<{ kind: 'file' | 'tree'; path: string }> = []
    await deleteOwnedAuthorization('/profile/plugins/wecom', {
      removeFile: async path => { calls.push({ kind: 'file', path }) },
      removeTree: async path => { calls.push({ kind: 'tree', path }) },
    })

    expect(calls).toEqual([
      { kind: 'file', path: '/profile/plugins/wecom/credentials.enc' },
      { kind: 'file', path: '/profile/plugins/wecom/.encryption_key' },
      { kind: 'tree', path: '/profile/plugins/wecom/cache' },
    ])
  })

  it('rejects a filesystem root as a plugin configuration directory', async () => {
    await expect(deleteOwnedAuthorization('/', {
      removeFile: async () => {}, removeTree: async () => {},
    })).rejects.toThrow('unsafe WeCom configuration directory')
  })
})
