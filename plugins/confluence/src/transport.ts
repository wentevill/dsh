import { z } from 'zod'
import { ConfluenceError, confluenceError } from './errors.ts'

export interface ConfluenceConnection {
  baseUrl: string
  token: string
}

export interface SearchRequest { cql: string; start: number; limit: number }
export interface CreatePageRequest { spaceKey: string; title: string; storage: string; parentPageId?: string; versionMessage?: string }
export interface UpdatePageRequest { pageId: string; title: string; storage: string; nextVersion: number; versionMessage?: string }

const serverInformationSchema = z.object({ version: z.string(), buildNumber: z.number() })
const spaceProbeSchema = z.object({ results: z.array(z.object({ key: z.string() })) })
const pageSchema = z.object({
  id: z.string(),
  type: z.string().default('page'),
  title: z.string(),
  space: z.object({ key: z.string() }),
  version: z.object({ number: z.number(), when: z.string().optional() }),
  body: z.object({ storage: z.object({ value: z.string() }) }).optional(),
  _links: z.object({ webui: z.string().optional(), base: z.string().optional() }).optional(),
})
const searchSchema = z.object({
  results: z.array(z.object({
    title: z.string(),
    excerpt: z.string().optional(),
    url: z.string().optional(),
    lastModified: z.string().optional(),
    entity: pageSchema.optional(),
    content: pageSchema.optional(),
  })),
  start: z.number().optional(), limit: z.number().optional(), size: z.number().optional(),
  _links: z.object({ next: z.string().optional() }).optional(),
})

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

interface TransportOptions {
  timeoutMs?: number
  maxResponseChars?: number
  retryDelayMs?: number
}

function statusError(status: number): ConfluenceError {
  if (status === 401) return confluenceError('personal access token is invalid or expired', 'CONFLUENCE_UNAUTHORIZED')
  if (status === 403) return confluenceError('the token lacks permission for this resource', 'CONFLUENCE_FORBIDDEN')
  if (status === 404) return confluenceError('resource is unavailable or not visible', 'CONFLUENCE_NOT_FOUND')
  if (status === 409) return confluenceError('page version changed; read it again before updating', 'CONFLUENCE_CONFLICT')
  if (status === 429) return confluenceError('Confluence rate limit was reached', 'CONFLUENCE_RATE_LIMITED')
  return confluenceError(`Confluence returned HTTP ${status}`, status >= 500 ? 'CONFLUENCE_UNAVAILABLE' : 'CONFLUENCE_RESPONSE_INVALID')
}

function temporary(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

async function boundedText(response: Response, maxChars: number): Promise<string> {
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      if (text.length > maxChars) {
        await reader.cancel()
        throw confluenceError('response exceeded the configured limit', 'CONFLUENCE_RESPONSE_TOO_LARGE')
      }
    }
    text += decoder.decode()
    if (text.length > maxChars) throw confluenceError('response exceeded the configured limit', 'CONFLUENCE_RESPONSE_TOO_LARGE')
    return text
  } finally {
    reader.releaseLock()
  }
}

export class FetchConfluenceTransport {
  private readonly timeoutMs: number
  private readonly maxResponseChars: number
  private readonly retryDelayMs: number

  constructor(private readonly fetch: Fetch = globalThis.fetch, options: TransportOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 20_000
    this.maxResponseChars = options.maxResponseChars ?? 2_000_000
    this.retryDelayMs = options.retryDelayMs ?? 50
  }

  private async request<T>(
    connection: ConfluenceConnection,
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const url = `${connection.baseUrl}${path}`
    const attempts = method === 'GET' ? 2 : 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const timeout = AbortSignal.timeout(this.timeoutMs)
      const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
      let response: Response
      let text: string
      try {
        response = await this.fetch(url, {
          method,
          redirect: 'manual',
          signal: combined,
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${connection.token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
        if (response.status >= 300 && response.status < 400) throw confluenceError('redirects are not allowed', 'CONFLUENCE_REDIRECT_REJECTED')
        if (!response.ok) {
          if (attempt + 1 < attempts && temporary(response.status)) {
            if (this.retryDelayMs > 0) await new Promise(resolve => setTimeout(resolve, this.retryDelayMs))
            continue
          }
          throw statusError(response.status)
        }
        text = await boundedText(response, this.maxResponseChars)
      } catch (cause) {
        if (cause instanceof ConfluenceError) throw cause
        if (method !== 'GET') throw new ConfluenceError('confluence: write result is indeterminate; read before retrying', 'CONFLUENCE_WRITE_INDETERMINATE')
        if (signal?.aborted === true) throw cause
        if (attempt + 1 < attempts) continue
        throw new ConfluenceError('confluence: network request failed', 'CONFLUENCE_NETWORK_ERROR')
      }
      let parsed: unknown
      try { parsed = text === '' ? {} : JSON.parse(text) } catch { throw confluenceError('response was not valid JSON', 'CONFLUENCE_RESPONSE_INVALID') }
      const result = schema.safeParse(parsed)
      if (!result.success) throw confluenceError('response shape was invalid', 'CONFLUENCE_RESPONSE_INVALID')
      return result.data
    }
    throw confluenceError('request failed', 'CONFLUENCE_NETWORK_ERROR')
  }

  private async writeAck(
    connection: ConfluenceConnection,
    path: string,
    body: unknown,
    signal?: AbortSignal,
  ): Promise<void> {
    const timeout = AbortSignal.timeout(this.timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    let response: Response
    try {
      response = await this.fetch(`${connection.baseUrl}${path}`, {
        method: 'PUT', redirect: 'manual', signal: combined,
        headers: { Accept: 'application/json', Authorization: `Bearer ${connection.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      throw new ConfluenceError('confluence: write result is indeterminate; read before retrying', 'CONFLUENCE_WRITE_INDETERMINATE')
    }
    if (response.status >= 300 && response.status < 400) throw confluenceError('redirects are not allowed', 'CONFLUENCE_REDIRECT_REJECTED')
    if (!response.ok) throw statusError(response.status)
    // Confluence 7.x may keep the successful PUT response body open. The status
    // is authoritative; cancel it and confirm the committed page with a GET.
    if (response.body !== null) void response.body.cancel().catch(() => undefined)
  }

  serverInformation(connection: ConfluenceConnection, signal?: AbortSignal) {
    return this.request(connection, 'GET', '/rest/api/server-information', serverInformationSchema, undefined, signal)
  }

  getSpace(connection: ConfluenceConnection, spaceKey: string, signal?: AbortSignal) {
    return this.request(connection, 'GET', `/rest/api/space/${encodeURIComponent(spaceKey)}`, z.object({ key: z.string(), name: z.string().optional() }), undefined, signal)
  }

  probeSpaces(connection: ConfluenceConnection, signal?: AbortSignal) {
    return this.request(connection, 'GET', '/rest/api/space?limit=1', spaceProbeSchema, undefined, signal)
  }

  searchPages(connection: ConfluenceConnection, request: SearchRequest, signal?: AbortSignal) {
    const query = new URLSearchParams({ cql: request.cql, start: String(request.start), limit: String(request.limit), expand: 'content.space,content.version' })
    return this.request(connection, 'GET', `/rest/api/search?${query.toString()}`, searchSchema, undefined, signal)
  }

  readPage(connection: ConfluenceConnection, pageId: string, signal?: AbortSignal) {
    return this.request(connection, 'GET', `/rest/api/content/${encodeURIComponent(pageId)}?expand=body.storage,version,space`, pageSchema, undefined, signal)
  }

  createPage(connection: ConfluenceConnection, request: CreatePageRequest, signal?: AbortSignal) {
    return this.request(connection, 'POST', '/rest/api/content', pageSchema, {
      type: 'page', title: request.title, space: { key: request.spaceKey },
      body: { storage: { value: request.storage, representation: 'storage' } },
      ...(request.parentPageId === undefined ? {} : { ancestors: [{ id: request.parentPageId }] }),
      ...(request.versionMessage === undefined ? {} : { version: { message: request.versionMessage } }),
    }, signal)
  }

  async updatePage(connection: ConfluenceConnection, request: UpdatePageRequest, signal?: AbortSignal) {
    await this.writeAck(connection, `/rest/api/content/${encodeURIComponent(request.pageId)}`, {
      id: request.pageId, type: 'page', title: request.title,
      body: { storage: { value: request.storage, representation: 'storage' } },
      version: { number: request.nextVersion, ...(request.versionMessage === undefined ? {} : { message: request.versionMessage }) },
    }, signal)
    return this.readPage(connection, request.pageId, signal)
  }
}

export type ConfluencePage = z.infer<typeof pageSchema>
export type ConfluenceSearchResponse = z.infer<typeof searchSchema>
