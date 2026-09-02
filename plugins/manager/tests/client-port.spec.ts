// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createPluginManagerPort, type PluginManagerRemoteFace } from '../src/client/port.ts'

function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value }
}

describe('createPluginManagerPort', () => {
  it('uploads a file in negotiated chunks and finishes immediately', async () => {
    const appended: Array<{ index: number; bytesBase64: string }> = []
    const remote: PluginManagerRemoteFace = {
      list: async () => ok({ entries: [] }),
      begin: async () => ok({ uploadId: 'upload-1', chunkSize: 3 }),
      append: async request => {
        appended.push({ index: request.index, bytesBase64: request.bytesBase64 })
        return ok({ received: (request.index + 1) * 3, size: 6 })
      },
      finish: async () => ok({ action: 'install', packageName: 'dsh-example', version: '1.0.0', requiresRestart: true }),
      cancel: async () => ok({ cancelled: true }),
      uninstall: async request => ok({ packageName: request.packageName, version: request.expectedVersion, requiresRestart: true }),
    }
    const port = createPluginManagerPort(remote)
    const file = new File([Uint8Array.from([1, 2, 3, 4, 5, 6])], 'plugin.tgz')
    const progress: Array<[number, number]> = []

    await expect(port.install(file, (received, size) => { progress.push([received, size]) }))
      .resolves.toMatchObject({ packageName: 'dsh-example', version: '1.0.0' })
    expect(appended).toEqual([
      { index: 0, bytesBase64: 'AQID' },
      { index: 1, bytesBase64: 'BAUG' },
    ])
    expect(progress).toEqual([[3, 6], [6, 6]])
  })

  it('cancels the upload when a chunk request fails', async () => {
    const cancelled: string[] = []
    const remote: PluginManagerRemoteFace = {
      list: async () => ok({ entries: [] }),
      begin: async () => ok({ uploadId: 'upload-2', chunkSize: 3 }),
      append: async () => ({ ok: false, error: { code: 'REMOTE_ERROR', message: 'failed' } }),
      finish: async () => ok({ action: 'install', packageName: 'x', version: '1.0.0', requiresRestart: true }),
      cancel: async request => { cancelled.push(request.uploadId); return ok({ cancelled: true }) },
      uninstall: async request => ok({ packageName: request.packageName, version: request.expectedVersion, requiresRestart: true }),
    }
    const port = createPluginManagerPort(remote)
    await expect(port.install(new File(['abcdef'], 'plugin.tgz'))).rejects.toThrow('failed')
    expect(cancelled).toEqual(['upload-2'])
  })
})
