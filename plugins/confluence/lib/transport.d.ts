import { z } from 'zod';
export interface ConfluenceConnection {
    baseUrl: string;
    token: string;
}
export interface SearchRequest {
    cql: string;
    start: number;
    limit: number;
}
export interface CreatePageRequest {
    spaceKey: string;
    title: string;
    storage: string;
    parentPageId?: string;
    versionMessage?: string;
}
export interface UpdatePageRequest {
    pageId: string;
    title: string;
    storage: string;
    nextVersion: number;
    versionMessage?: string;
}
declare const pageSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodDefault<z.ZodString>;
    title: z.ZodString;
    space: z.ZodObject<{
        key: z.ZodString;
    }, z.core.$strip>;
    version: z.ZodObject<{
        number: z.ZodNumber;
        when: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
    body: z.ZodOptional<z.ZodObject<{
        storage: z.ZodObject<{
            value: z.ZodString;
        }, z.core.$strip>;
    }, z.core.$strip>>;
    _links: z.ZodOptional<z.ZodObject<{
        webui: z.ZodOptional<z.ZodString>;
        base: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
declare const searchSchema: z.ZodObject<{
    results: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        excerpt: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        lastModified: z.ZodOptional<z.ZodString>;
        entity: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodDefault<z.ZodString>;
            title: z.ZodString;
            space: z.ZodObject<{
                key: z.ZodString;
            }, z.core.$strip>;
            version: z.ZodObject<{
                number: z.ZodNumber;
                when: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            body: z.ZodOptional<z.ZodObject<{
                storage: z.ZodObject<{
                    value: z.ZodString;
                }, z.core.$strip>;
            }, z.core.$strip>>;
            _links: z.ZodOptional<z.ZodObject<{
                webui: z.ZodOptional<z.ZodString>;
                base: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
        content: z.ZodOptional<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodDefault<z.ZodString>;
            title: z.ZodString;
            space: z.ZodObject<{
                key: z.ZodString;
            }, z.core.$strip>;
            version: z.ZodObject<{
                number: z.ZodNumber;
                when: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>;
            body: z.ZodOptional<z.ZodObject<{
                storage: z.ZodObject<{
                    value: z.ZodString;
                }, z.core.$strip>;
            }, z.core.$strip>>;
            _links: z.ZodOptional<z.ZodObject<{
                webui: z.ZodOptional<z.ZodString>;
                base: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    start: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
    size: z.ZodOptional<z.ZodNumber>;
    _links: z.ZodOptional<z.ZodObject<{
        next: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
interface TransportOptions {
    timeoutMs?: number;
    maxResponseChars?: number;
    retryDelayMs?: number;
}
export declare class FetchConfluenceTransport {
    private readonly fetch;
    private readonly timeoutMs;
    private readonly maxResponseChars;
    private readonly retryDelayMs;
    constructor(fetch?: Fetch, options?: TransportOptions);
    private request;
    private writeAck;
    serverInformation(connection: ConfluenceConnection, signal?: AbortSignal): Promise<{
        version: string;
        buildNumber: number;
    }>;
    getSpace(connection: ConfluenceConnection, spaceKey: string, signal?: AbortSignal): Promise<{
        key: string;
        name?: string | undefined;
    }>;
    probeSpaces(connection: ConfluenceConnection, signal?: AbortSignal): Promise<{
        results: {
            key: string;
        }[];
    }>;
    searchPages(connection: ConfluenceConnection, request: SearchRequest, signal?: AbortSignal): Promise<{
        results: {
            title: string;
            excerpt?: string | undefined;
            url?: string | undefined;
            lastModified?: string | undefined;
            entity?: {
                id: string;
                type: string;
                title: string;
                space: {
                    key: string;
                };
                version: {
                    number: number;
                    when?: string | undefined;
                };
                body?: {
                    storage: {
                        value: string;
                    };
                } | undefined;
                _links?: {
                    webui?: string | undefined;
                    base?: string | undefined;
                } | undefined;
            } | undefined;
            content?: {
                id: string;
                type: string;
                title: string;
                space: {
                    key: string;
                };
                version: {
                    number: number;
                    when?: string | undefined;
                };
                body?: {
                    storage: {
                        value: string;
                    };
                } | undefined;
                _links?: {
                    webui?: string | undefined;
                    base?: string | undefined;
                } | undefined;
            } | undefined;
        }[];
        start?: number | undefined;
        limit?: number | undefined;
        size?: number | undefined;
        _links?: {
            next?: string | undefined;
        } | undefined;
    }>;
    readPage(connection: ConfluenceConnection, pageId: string, signal?: AbortSignal): Promise<{
        id: string;
        type: string;
        title: string;
        space: {
            key: string;
        };
        version: {
            number: number;
            when?: string | undefined;
        };
        body?: {
            storage: {
                value: string;
            };
        } | undefined;
        _links?: {
            webui?: string | undefined;
            base?: string | undefined;
        } | undefined;
    }>;
    createPage(connection: ConfluenceConnection, request: CreatePageRequest, signal?: AbortSignal): Promise<{
        id: string;
        type: string;
        title: string;
        space: {
            key: string;
        };
        version: {
            number: number;
            when?: string | undefined;
        };
        body?: {
            storage: {
                value: string;
            };
        } | undefined;
        _links?: {
            webui?: string | undefined;
            base?: string | undefined;
        } | undefined;
    }>;
    updatePage(connection: ConfluenceConnection, request: UpdatePageRequest, signal?: AbortSignal): Promise<{
        id: string;
        type: string;
        title: string;
        space: {
            key: string;
        };
        version: {
            number: number;
            when?: string | undefined;
        };
        body?: {
            storage: {
                value: string;
            };
        } | undefined;
        _links?: {
            webui?: string | undefined;
            base?: string | undefined;
        } | undefined;
    }>;
}
export type ConfluencePage = z.infer<typeof pageSchema>;
export type ConfluenceSearchResponse = z.infer<typeof searchSchema>;
export {};
