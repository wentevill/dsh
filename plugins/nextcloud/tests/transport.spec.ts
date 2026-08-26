import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { NextcloudTransport, buildSearchXml, createNextcloudTransport, type WebDavClientPort } from '../src/transport.ts'

function client(overrides: Partial<WebDavClientPort> = {}): WebDavClientPort {
  return {
    getDirectoryContents: vi.fn(async () => []),
    stat: vi.fn(async () => ({ filename: '/', basename: '', type: 'directory', size: 0, lastmod: '', etag: null })),
    getFileContents: vi.fn(async () => ''),
    createReadStream: vi.fn(() => Readable.from([])),
    putFileContents: vi.fn(async () => true),
    createDirectory: vi.fn(async () => undefined),
    moveFile: vi.fn(async () => undefined),
    deleteFile: vi.fn(async () => undefined),
    customRequest: vi.fn(async () => ({ ok: true, status: 207, text: async () => '<d:multistatus xmlns:d="DAV:" />' })),
    ...overrides,
  }
}

describe('Nextcloud WebDAV transport', () => {
  it('creates separate file and DAV clients with bounded XML parsing and strict redirect handling', () => {
    const calls: Array<{ url: string; options: Record<string, unknown> }> = []
    const factory = (url: string, options: Record<string, unknown>) => {
      calls.push({ url, options })
      return client()
    }
    createNextcloudTransport({
      serverUrl: 'https://cloud.example.com/nc', username: 'alice', accessMode: 'all', allowedRoots: [],
      allowDelete: false, allowHttp: false, skipTlsVerify: true,
      davUrl: 'https://cloud.example.com/nc/remote.php/dav/files/alice',
    }, 'app-password', factory)

    expect(calls.map(call => call.url)).toEqual([
      'https://cloud.example.com/nc/remote.php/dav/files/alice',
      'https://cloud.example.com/nc/remote.php/dav',
      'https://cloud.example.com/nc',
    ])
    for (const call of calls) {
      expect(call.options).toMatchObject({
        username: 'alice', password: 'app-password',
        entityDecoder: { limit: { maxTotalExpansions: 1_000, maxExpandedLength: 1_000_000 } },
      })
      expect((call.options.httpsAgent as { options: { rejectUnauthorized: boolean } }).options.rejectUnauthorized).toBe(false)
    }
  })

  it('builds an escaped, bounded filename search scoped to the authenticated user path', () => {
    const xml = buildSearchXml({ username: 'alice', path: '/团队资料', query: 'Q1 & <draft>', limit: 25 })
    expect(xml).toContain('<d:href>/files/alice/%E5%9B%A2%E9%98%9F%E8%B5%84%E6%96%99</d:href>')
    expect(xml).toContain('<d:literal>%Q1 &amp; &lt;draft&gt;%</d:literal>')
    expect(xml).toContain('<d:limit><d:nresults>25</d:nresults></d:limit>')
    expect(xml).toContain('<d:prop><d:displayname/></d:prop>')
  })

  it('passes cancellation and disables redirects for read-only DAV operations', async () => {
    const getDirectoryContents = vi.fn(async () => [{ filename: '/a.txt', basename: 'a.txt', type: 'file' as const, size: 4, lastmod: 'today', etag: 'v1', mime: 'text/plain' }])
    const stat = vi.fn(async () => ({ filename: '/a.txt', basename: 'a.txt', type: 'file' as const, size: 4, lastmod: 'today', etag: 'v1', mime: 'text/plain' }))
    const getFileContents = vi.fn(async () => 'text')
    const file = client({ getDirectoryContents, stat, getFileContents })
    const transport = new NextcloudTransport(file, client(), 'alice')
    const signal = new AbortController().signal

    expect(await transport.list('/')).toHaveLength(1)
    expect(await transport.stat('/a.txt', signal)).toMatchObject({ path: '/a.txt', etag: 'v1' })
    expect(await transport.readText('/a.txt', signal)).toBe('text')
    expect(getDirectoryContents).toHaveBeenCalledWith('/', { maxRedirects: 0, signal: undefined })
    expect(stat).toHaveBeenCalledWith('/a.txt', { maxRedirects: 0, signal })
    expect(getFileContents).toHaveBeenCalledWith('/a.txt', { format: 'text', maxRedirects: 0, signal })
  })

  it('uses non-overwriting writes by default and forwards abort signals', async () => {
    const putFileContents = vi.fn(async () => true)
    const createDirectory = vi.fn(async () => undefined)
    const moveFile = vi.fn(async () => undefined)
    const deleteFile = vi.fn(async () => undefined)
    const file = client({ putFileContents, createDirectory, moveFile, deleteFile })
    const transport = new NextcloudTransport(file, client(), 'alice')
    const signal = new AbortController().signal

    await transport.upload('/report.txt', Readable.from('body'), 4, false, signal)
    await transport.mkdir('/Reports', signal)
    await transport.move('/report.txt', '/Reports/report.txt', false, signal)
    await transport.delete('/Reports/report.txt', signal)

    expect(putFileContents).toHaveBeenCalledWith('/report.txt', expect.any(Readable), { contentLength: 4, maxRedirects: 0, overwrite: false, signal })
    expect(createDirectory).toHaveBeenCalledWith('/Reports', { maxRedirects: 0, recursive: false, signal })
    expect(moveFile).toHaveBeenCalledWith('/report.txt', '/Reports/report.txt', { maxRedirects: 0, overwrite: false, signal })
    expect(deleteFile).toHaveBeenCalledWith('/Reports/report.txt', { maxRedirects: 0, signal })
  })

  it('parses SEARCH multistatus entries back into user-relative paths', async () => {
    const response = `<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response>
      <d:href>/nc/remote.php/dav/files/alice/%E5%9B%A2%E9%98%9F/report.txt</d:href><d:propstat><d:prop>
      <d:displayname>report.txt</d:displayname><d:getcontentlength>12</d:getcontentlength>
      <d:getcontenttype>text/plain</d:getcontenttype><d:getlastmodified>Wed, 26 Aug 2026 00:00:00 GMT</d:getlastmodified>
      <d:getetag>&quot;v1&quot;</d:getetag><d:resourcetype/></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
      </d:response></d:multistatus>`
    const customRequest = vi.fn(async () => ({ ok: true, status: 207, text: async () => response }))
    const transport = new NextcloudTransport(client(), client({ customRequest }), 'alice')
    expect(await transport.search({ path: '/团队', query: 'report', limit: 10 })).toEqual([{ 
      path: '/团队/report.txt', name: 'report.txt', type: 'file', size: 12,
      modifiedAt: 'Wed, 26 Aug 2026 00:00:00 GMT', etag: 'v1', mimeType: 'text/plain',
    }])
    expect(customRequest).toHaveBeenCalledWith('/', expect.objectContaining({ method: 'SEARCH', maxRedirects: 0 }))
  })
})
