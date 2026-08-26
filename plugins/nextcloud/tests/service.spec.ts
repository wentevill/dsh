import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { NextcloudFileService, type NextcloudTransportPort } from '../src/service.ts'
import type { RemoteEntry } from '../src/transport.ts'

const file = (path: string, size = 4, mimeType = 'text/plain'): RemoteEntry => ({
  path, name: path.split('/').at(-1)!, type: 'file', size,
  modifiedAt: 'Wed, 26 Aug 2026 00:00:00 GMT', etag: 'v1', mimeType,
})

function transport(overrides: Partial<NextcloudTransportPort> = {}): NextcloudTransportPort {
  return {
    list: vi.fn(async () => []), stat: vi.fn(async path => file(path)), search: vi.fn(async () => []),
    readText: vi.fn(async () => 'body'), download: vi.fn(() => Readable.from('downloaded')),
    upload: vi.fn(async () => undefined), mkdir: vi.fn(async () => undefined),
    move: vi.fn(async () => undefined), delete: vi.fn(async () => undefined),
    ...overrides,
  }
}

function service(client: NextcloudTransportPort): NextcloudFileService {
  return new NextcloudFileService(client, { accessMode: 'allowlist', allowedRoots: ['/AI'] })
}

describe('Nextcloud file service', () => {
  it('defaults list and search to the first configured root', async () => {
    const client = transport()
    const files = service(client)
    await files.list()
    await files.search({ query: 'report' })
    expect(client.list).toHaveBeenCalledWith('/AI', undefined)
    expect(client.search).toHaveBeenCalledWith({ path: '/AI', query: 'report', limit: 101 }, undefined)
  })

  it('bounds directory and search results and reports truncation', async () => {
    const entries = Array.from({ length: 4 }, (_, index) => file(`/AI/${index}.txt`))
    const client = transport({ list: vi.fn(async () => entries), search: vi.fn(async () => entries) })
    expect(await service(client).list('/AI', 2)).toEqual({ entries: entries.slice(0, 2), truncated: true })
    expect(await service(client).search({ path: '/AI', query: 'txt', limit: 3 })).toEqual({ entries: entries.slice(0, 3), truncated: true })
    expect(client.search).toHaveBeenCalledWith({ path: '/AI', query: 'txt', limit: 4 }, undefined)
  })

  it('normalizes and validates mutation paths before approval', () => {
    const files = service(transport())
    expect(files.validateUploadPath('/AI//draft.txt')).toBe('/AI/draft.txt')
    expect(files.validateMovePaths('/AI/a', '/AI//b')).toEqual({ source: '/AI/a', destination: '/AI/b' })
    expect(() => files.validateDeletePath('/AI')).toThrow(/configured root/u)
  })

  it('returns bounded text chunks with an explicit continuation offset', async () => {
    const client = transport({ readText: vi.fn(async () => '0123456789') })
    expect(await service(client).read('/AI/a.txt', { offsetChars: 3, maxChars: 4 })).toEqual({
      kind: 'text', path: '/AI/a.txt', text: '3456', nextOffsetChars: 7, truncated: true,
    })
  })

  it('automatically downloads non-text and files larger than 100 MiB', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nextcloud-service-'))
    for (const metadata of [file('/AI/image.png', 10, 'image/png'), file('/AI/huge.txt', 100 * 1024 * 1024 + 1)]) {
      const client = transport({ stat: vi.fn(async () => metadata), download: vi.fn(() => Readable.from(metadata.name)) })
      const result = await service(client).read(metadata.path, { workspace })
      expect(result).toMatchObject({ kind: 'download', remotePath: metadata.path })
      if (result.kind === 'download') expect(await readFile(join(workspace, result.localPath), 'utf8')).toBe(metadata.name)
    }
  })

  it('normalizes and validates every remote mutation path', async () => {
    const client = transport()
    const files = service(client)
    await files.mkdir('/AI//Reports')
    await files.move('/AI/a.txt', '/AI/Reports/a.txt', false)
    await files.delete('/AI/old.txt')
    expect(client.mkdir).toHaveBeenCalledWith('/AI/Reports', undefined)
    expect(client.move).toHaveBeenCalledWith('/AI/a.txt', '/AI/Reports/a.txt', false, undefined)
    expect(client.delete).toHaveBeenCalledWith('/AI/old.txt', undefined)
    await expect(files.delete('/AI')).rejects.toThrow(/configured root/u)
  })

  it('uploads only a snapshotted workspace file', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'nextcloud-upload-'))
    await writeFile(join(workspace, 'report.txt'), 'upload me')
    const upload = vi.fn(async (_path, input: Readable) => {
      let body = ''
      for await (const chunk of input) body += chunk.toString()
      expect(body).toBe('upload me')
    })
    const result = await service(transport({ upload })).upload(workspace, 'report.txt', '/AI/report.txt', false)
    expect(result).toMatchObject({ remotePath: '/AI/report.txt', size: 9 })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u)
  })
})
