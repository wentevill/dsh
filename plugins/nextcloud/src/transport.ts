import type { Readable } from 'node:stream'
import { Agent as HttpsAgent } from 'node:https'
import { createClient, parseXML, prepareFileFromProps } from 'webdav'
import type { ResolvedNextcloudSettings } from './settings.ts'
import { nextcloudProviderError } from './errors.ts'
import { OcsSharingTransport } from './sharing-transport.ts'

export interface WebDavFileStat {
  readonly filename: string
  readonly basename: string
  readonly type: 'file' | 'directory'
  readonly size: number
  readonly lastmod: string
  readonly etag: string | null
  readonly mime?: string
}

interface DavOptions {
  readonly maxRedirects?: number
  readonly signal?: AbortSignal
}

export interface WebDavClientPort {
  getDirectoryContents(path: string, options: DavOptions): Promise<readonly WebDavFileStat[]>
  stat(path: string, options: DavOptions): Promise<WebDavFileStat>
  getFileContents(path: string, options: DavOptions & { format: 'text' }): Promise<unknown>
  createReadStream(path: string, options: DavOptions): Readable
  putFileContents(path: string, data: Readable, options: DavOptions & { contentLength: number; overwrite: boolean }): Promise<boolean>
  createDirectory(path: string, options: DavOptions & { recursive: boolean }): Promise<void>
  moveFile(source: string, destination: string, options: DavOptions & { overwrite: boolean }): Promise<void>
  deleteFile(path: string, options: DavOptions): Promise<void>
  customRequest(path: string, options: DavOptions & { method: string; headers?: Record<string, string>; data?: string }): Promise<{
    readonly ok: boolean
    readonly status: number
    text(): Promise<string>
  }>
}

export interface RemoteEntry {
  readonly path: string
  readonly name: string
  readonly type: 'file' | 'directory'
  readonly size: number
  readonly modifiedAt: string
  readonly etag: string | null
  readonly mimeType?: string
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;')
}

function davHref(username: string, path: string): string {
  const encoded = path.split('/').map(segment => encodeURIComponent(segment)).join('/')
  return `/files/${encodeURIComponent(username)}${encoded === '/' ? '' : encoded}`
}

export interface SearchInput {
  readonly username: string
  readonly path: string
  readonly query: string
  readonly limit: number
}

export function buildSearchXml(input: SearchInput): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<d:searchrequest xmlns:d="DAV:">
  <d:basicsearch>
    <d:select><d:prop><d:displayname/><d:resourcetype/><d:getcontentlength/><d:getcontenttype/><d:getlastmodified/><d:getetag/></d:prop></d:select>
    <d:from><d:scope><d:href>${xml(davHref(input.username, input.path))}</d:href><d:depth>infinity</d:depth></d:scope></d:from>
    <d:where><d:like><d:prop><d:displayname/></d:prop><d:literal>${xml(`%${input.query}%`)}</d:literal></d:like></d:where>
    <d:orderby><d:order><d:prop><d:displayname/></d:prop><d:ascending/></d:order></d:orderby>
    <d:limit><d:nresults>${input.limit}</d:nresults></d:limit>
  </d:basicsearch>
</d:searchrequest>`
}

function entry(stat: WebDavFileStat): RemoteEntry {
  return {
    path: stat.filename,
    name: stat.basename,
    type: stat.type,
    size: stat.size,
    modifiedAt: stat.lastmod,
    etag: stat.etag,
    ...(stat.mime === undefined ? {} : { mimeType: stat.mime }),
  }
}

const options = (signal?: AbortSignal): DavOptions => ({ maxRedirects: 0, signal })

async function provider<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() } catch (error) { throw nextcloudProviderError(error) }
}

export class NextcloudTransport {
  readonly sharing: OcsSharingTransport
  constructor(
    private readonly files: WebDavClientPort,
    private readonly dav: WebDavClientPort,
    readonly username: string,
    ocs: WebDavClientPort = dav,
    ocsBaseUrl?: string,
  ) { this.sharing = new OcsSharingTransport(ocs, ocsBaseUrl) }

  async list(path: string, signal?: AbortSignal): Promise<RemoteEntry[]> {
    return (await provider(() => this.files.getDirectoryContents(path, options(signal)))).map(entry)
  }

  async stat(path: string, signal?: AbortSignal): Promise<RemoteEntry> {
    return entry(await provider(() => this.files.stat(path, options(signal))))
  }

  async readText(path: string, signal?: AbortSignal): Promise<string> {
    const result = await provider(() => this.files.getFileContents(path, { format: 'text', ...options(signal) }))
    if (typeof result !== 'string') throw new Error('Nextcloud returned non-text content')
    return result
  }

  download(path: string, signal?: AbortSignal): Readable {
    try { return this.files.createReadStream(path, options(signal)) } catch (error) { throw nextcloudProviderError(error) }
  }

  async upload(path: string, input: Readable, size: number, overwrite: boolean, signal?: AbortSignal): Promise<void> {
    await provider(() => this.files.putFileContents(path, input, { contentLength: size, overwrite, ...options(signal) }))
  }

  async mkdir(path: string, signal?: AbortSignal): Promise<void> {
    await provider(() => this.files.createDirectory(path, { recursive: false, ...options(signal) }))
  }

  async move(source: string, destination: string, overwrite: boolean, signal?: AbortSignal): Promise<void> {
    await provider(() => this.files.moveFile(source, destination, { overwrite, ...options(signal) }))
  }

  async delete(path: string, signal?: AbortSignal): Promise<void> {
    await provider(() => this.files.deleteFile(path, options(signal)))
  }

  searchRequest(input: Omit<SearchInput, 'username'>, signal?: AbortSignal) {
    return this.dav.customRequest('/', {
      method: 'SEARCH',
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      data: buildSearchXml({ ...input, username: this.username }),
      ...options(signal),
    })
  }

  async search(input: Omit<SearchInput, 'username'>, signal?: AbortSignal): Promise<RemoteEntry[]> {
    const response = await provider(() => this.searchRequest(input, signal))
    if (!response.ok) throw Object.assign(new Error('Nextcloud SEARCH failed'), { status: response.status })
    const parsed = await parseXML(await response.text()) as {
      multistatus?: { response?: Array<{ href?: string; propstat?: { prop?: Record<string, unknown> } }> }
    }
    const prefix = `/files/${encodeURIComponent(this.username)}`
    const results: RemoteEntry[] = []
    for (const item of parsed.multistatus?.response ?? []) {
      if (typeof item.href !== 'string' || item.propstat?.prop === undefined) continue
      const prefixAt = item.href.indexOf(prefix)
      if (prefixAt < 0) continue
      const encodedPath = item.href.slice(prefixAt + prefix.length) || '/'
      const path = encodedPath.split('/').map(segment => decodeURIComponent(segment)).join('/')
      const stat = prepareFileFromProps(item.propstat.prop as never, path) as WebDavFileStat
      results.push(entry(stat))
    }
    return results
  }
}

interface ClientFactoryOptions {
  readonly username: string
  readonly password: string
  readonly httpsAgent: HttpsAgent
  readonly entityDecoder: { readonly limit: { readonly maxTotalExpansions: number; readonly maxExpandedLength: number } }
}

type ClientFactory = (url: string, options: ClientFactoryOptions) => WebDavClientPort

/** Create authenticated clients rooted at user files, DAV SEARCH, and the server OCS API. */
export function createNextcloudTransport(
  settings: ResolvedNextcloudSettings,
  password: string,
  factory: ClientFactory = createClient as unknown as ClientFactory,
): NextcloudTransport {
  const clientOptions: ClientFactoryOptions = {
    username: settings.username,
    password,
    httpsAgent: new HttpsAgent({ rejectUnauthorized: !settings.skipTlsVerify }),
    entityDecoder: { limit: { maxTotalExpansions: 1_000, maxExpandedLength: 1_000_000 } },
  }
  const files = factory(settings.davUrl, clientOptions)
  const dav = factory(`${settings.serverUrl}/remote.php/dav`, clientOptions)
  const ocs = factory(settings.serverUrl, clientOptions)
  return new NextcloudTransport(files, dav, settings.username, ocs, settings.serverUrl)
}
