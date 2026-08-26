import { describe, expect, it, vi } from 'vitest'
import { FetchConfluenceTransport } from '../src/transport.ts'

const connection = { baseUrl: 'https://wiki.example.test/confluence', token: 'sentinel-pat' }

describe('Confluence REST transport', () => {
  it('keeps the context path and authenticates with a bearer PAT', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ version: '9.2.1', buildNumber: 123 }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }))
    const transport = new FetchConfluenceTransport(fetch)

    await expect(transport.serverInformation(connection)).resolves.toEqual({ version: '9.2.1', buildNumber: 123 })
    expect(fetch).toHaveBeenCalledWith('https://wiki.example.test/confluence/rest/api/server-information', expect.objectContaining({
      method: 'GET', redirect: 'manual', headers: expect.objectContaining({ Authorization: 'Bearer sentinel-pat' }),
    }))
  })

  it('probes legacy Confluence access through a bounded space listing', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ results: [{ key: 'ENG' }], size: 1 })))
    const transport = new FetchConfluenceTransport(fetch)
    await expect(transport.probeSpaces(connection)).resolves.toEqual({ results: [{ key: 'ENG' }] })
    expect(fetch).toHaveBeenCalledWith(
      'https://wiki.example.test/confluence/rest/api/space?limit=1',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('rejects redirects instead of forwarding credentials', async () => {
    const transport = new FetchConfluenceTransport(async () => new Response(null, {
      status: 302, headers: { location: 'https://evil.example.test/steal' },
    }))
    await expect(transport.serverInformation(connection)).rejects.toMatchObject({ code: 'CONFLUENCE_REDIRECT_REJECTED' })
  })

  it('maps authentication errors without exposing the PAT or response body', async () => {
    const transport = new FetchConfluenceTransport(async () => new Response(`invalid sentinel-pat`, { status: 401 }))
    const error = await transport.serverInformation(connection).catch(value => value) as Error & { code: string }
    expect(error.code).toBe('CONFLUENCE_UNAUTHORIZED')
    expect(error.message).not.toContain('sentinel-pat')
  })

  it('retries one temporary GET failure', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '9.2.1', buildNumber: 123 }), { status: 200 }))
    const transport = new FetchConfluenceTransport(fetch, { retryDelayMs: 0 })
    await transport.serverInformation(connection)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not retry writes and reports an indeterminate network result', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('socket closed sentinel-pat') })
    const transport = new FetchConfluenceTransport(fetch)
    await expect(transport.createPage(connection, {
      spaceKey: 'ENG', title: 'Title', storage: '<p>Body</p>',
    })).rejects.toMatchObject({ code: 'CONFLUENCE_WRITE_INDETERMINATE' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stops reading a response once the configured limit is exceeded', async () => {
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new TextEncoder().encode('123456'))
      },
    })
    const transport = new FetchConfluenceTransport(async () => new Response(body), { maxResponseChars: 10 })
    await expect(transport.serverInformation(connection)).rejects.toMatchObject({ code: 'CONFLUENCE_RESPONSE_TOO_LARGE' })
    expect(pulls).toBeLessThan(10)
  })

  it('retries a GET when reading the response stream fails', async () => {
    const failed = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('socket closed')) } })
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(failed))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: '9.2.1', buildNumber: 123 })))
    const transport = new FetchConfluenceTransport(fetch)
    await expect(transport.serverInformation(connection)).resolves.toMatchObject({ version: '9.2.1' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('reports an indeterminate write when reading its response stream fails', async () => {
    const failed = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('socket closed')) } })
    const transport = new FetchConfluenceTransport(async () => new Response(failed))
    await expect(transport.createPage(connection, {
      spaceKey: 'ENG', title: 'Title', storage: '<p>Body</p>',
    })).rejects.toMatchObject({ code: 'CONFLUENCE_WRITE_INDETERMINATE' })
  })

  it('reports an indeterminate write when cancellation happens after dispatch', async () => {
    const controller = new AbortController()
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const transport = new FetchConfluenceTransport(fetch)
    const pending = transport.createPage(connection, { spaceKey: 'ENG', title: 'Title', storage: '<p>Body</p>' }, controller.signal)
    controller.abort(new Error('settings changed'))
    await expect(pending).rejects.toMatchObject({ code: 'CONFLUENCE_WRITE_INDETERMINATE' })
  })

  it('does not wait for a legacy Confluence PUT response body and confirms with GET', async () => {
    const neverEnds = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new TextEncoder().encode('{')) },
    })
    const page = { id: '100', type: 'page', title: 'Updated', space: { key: 'ENG' }, version: { number: 4 } }
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(neverEnds, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page), { status: 200 }))
    const transport = new FetchConfluenceTransport(fetch, { timeoutMs: 10 })
    await expect(transport.updatePage(connection, {
      pageId: '100', title: 'Updated', storage: '<p>Body</p>', nextVersion: 4,
    })).resolves.toEqual(page)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'PUT' })
    expect(fetch.mock.calls[1]?.[1]).toMatchObject({ method: 'GET' })
  })
})
