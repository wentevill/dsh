import type { Readable } from 'node:stream';
import { Agent as HttpsAgent } from 'node:https';
import type { ResolvedNextcloudSettings } from './settings.ts';
import { OcsSharingTransport } from './sharing-transport.ts';
export interface WebDavFileStat {
    readonly filename: string;
    readonly basename: string;
    readonly type: 'file' | 'directory';
    readonly size: number;
    readonly lastmod: string;
    readonly etag: string | null;
    readonly mime?: string;
}
interface DavOptions {
    readonly maxRedirects?: number;
    readonly signal?: AbortSignal;
}
export interface WebDavClientPort {
    getDirectoryContents(path: string, options: DavOptions): Promise<readonly WebDavFileStat[]>;
    stat(path: string, options: DavOptions): Promise<WebDavFileStat>;
    getFileContents(path: string, options: DavOptions & {
        format: 'text';
    }): Promise<unknown>;
    createReadStream(path: string, options: DavOptions): Readable;
    putFileContents(path: string, data: Readable, options: DavOptions & {
        contentLength: number;
        overwrite: boolean;
    }): Promise<boolean>;
    createDirectory(path: string, options: DavOptions & {
        recursive: boolean;
    }): Promise<void>;
    moveFile(source: string, destination: string, options: DavOptions & {
        overwrite: boolean;
    }): Promise<void>;
    deleteFile(path: string, options: DavOptions): Promise<void>;
    customRequest(path: string, options: DavOptions & {
        method: string;
        headers?: Record<string, string>;
        data?: string;
    }): Promise<{
        readonly ok: boolean;
        readonly status: number;
        text(): Promise<string>;
    }>;
}
export interface RemoteEntry {
    readonly path: string;
    readonly name: string;
    readonly type: 'file' | 'directory';
    readonly size: number;
    readonly modifiedAt: string;
    readonly etag: string | null;
    readonly mimeType?: string;
}
export interface SearchInput {
    readonly username: string;
    readonly path: string;
    readonly query: string;
    readonly limit: number;
}
export declare function buildSearchXml(input: SearchInput): string;
export declare class NextcloudTransport {
    private readonly files;
    private readonly dav;
    readonly username: string;
    readonly sharing: OcsSharingTransport;
    constructor(files: WebDavClientPort, dav: WebDavClientPort, username: string, ocs?: WebDavClientPort, ocsBaseUrl?: string);
    list(path: string, signal?: AbortSignal): Promise<RemoteEntry[]>;
    stat(path: string, signal?: AbortSignal): Promise<RemoteEntry>;
    readText(path: string, signal?: AbortSignal): Promise<string>;
    download(path: string, signal?: AbortSignal): Readable;
    upload(path: string, input: Readable, size: number, overwrite: boolean, signal?: AbortSignal): Promise<void>;
    mkdir(path: string, signal?: AbortSignal): Promise<void>;
    move(source: string, destination: string, overwrite: boolean, signal?: AbortSignal): Promise<void>;
    delete(path: string, signal?: AbortSignal): Promise<void>;
    searchRequest(input: Omit<SearchInput, 'username'>, signal?: AbortSignal): Promise<{
        readonly ok: boolean;
        readonly status: number;
        text(): Promise<string>;
    }>;
    search(input: Omit<SearchInput, 'username'>, signal?: AbortSignal): Promise<RemoteEntry[]>;
}
interface ClientFactoryOptions {
    readonly username: string;
    readonly password: string;
    readonly httpsAgent: HttpsAgent;
    readonly entityDecoder: {
        readonly limit: {
            readonly maxTotalExpansions: number;
            readonly maxExpandedLength: number;
        };
    };
}
type ClientFactory = (url: string, options: ClientFactoryOptions) => WebDavClientPort;
/** Create authenticated clients rooted at user files, DAV SEARCH, and the server OCS API. */
export declare function createNextcloudTransport(settings: ResolvedNextcloudSettings, password: string, factory?: ClientFactory): NextcloudTransport;
export {};
