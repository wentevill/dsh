import { type CreateShareInput, type NextcloudShare, type NextcloudSharee, type UpdateShareInput } from './sharing-types.ts';
interface OcsResponse {
    readonly ok: boolean;
    readonly status: number;
    text(): Promise<string>;
}
export interface OcsClientPort {
    customRequest(path: string, options: {
        method: string;
        url?: string;
        maxRedirects?: number;
        signal?: AbortSignal;
        headers?: Record<string, string>;
        data?: string;
    }): Promise<OcsResponse>;
}
export declare class OcsSharingTransport {
    private readonly client;
    private readonly baseUrl?;
    constructor(client: OcsClientPort, baseUrl?: string | undefined);
    private request;
    listShares(path?: string, signal?: AbortSignal): Promise<NextcloudShare[]>;
    getShare(id: number, signal?: AbortSignal): Promise<NextcloudShare>;
    searchSharees(queryText: string, limit: number, signal?: AbortSignal): Promise<NextcloudSharee[]>;
    createShare(input: CreateShareInput, signal?: AbortSignal): Promise<NextcloudShare>;
    updateShare(id: number, input: UpdateShareInput, signal?: AbortSignal): Promise<NextcloudShare>;
    deleteShare(id: number, signal?: AbortSignal): Promise<void>;
}
export {};
