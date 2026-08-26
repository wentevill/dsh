import { type PathPolicySettings } from './path-policy.ts';
import { type CreateShareInput, type NextcloudShare, type NextcloudSharee, type ShareProfile, type UpdateShareInput } from './sharing-types.ts';
export interface SharingTransportPort {
    listShares(path?: string, signal?: AbortSignal): Promise<NextcloudShare[]>;
    getShare(id: number, signal?: AbortSignal): Promise<NextcloudShare>;
    searchSharees(query: string, limit: number, signal?: AbortSignal): Promise<NextcloudSharee[]>;
    createShare(input: CreateShareInput, signal?: AbortSignal): Promise<NextcloudShare>;
    updateShare(id: number, input: UpdateShareInput, signal?: AbortSignal): Promise<NextcloudShare>;
    deleteShare(id: number, signal?: AbortSignal): Promise<void>;
}
interface FileMetadataPort {
    stat(path: string, signal?: AbortSignal): Promise<{
        type: 'file' | 'directory';
        etag?: string | null;
    }>;
}
export interface ShareCreateRequest extends CreateShareInput {
}
export interface ShareUpdateRequest {
    readonly profile?: ShareProfile;
    readonly password?: string;
    readonly expireDate?: string;
    readonly note?: string;
}
export declare class NextcloudSharingService {
    private readonly transport;
    private readonly files;
    private readonly policy;
    private readonly accessMode;
    constructor(transport: SharingTransportPort, files: FileMetadataPort, settings: PathPolicySettings);
    list(input?: {
        path?: string;
        limit?: number;
    }, signal?: AbortSignal): Promise<{
        shares: NextcloudShare[];
        truncated: boolean;
    }>;
    get(id: number, signal?: AbortSignal): Promise<NextcloudShare>;
    searchSharees(query: string, limitInput?: number, type?: 'all' | 'user' | 'group', signal?: AbortSignal): Promise<{
        sharees: NextcloudSharee[];
        truncated: boolean;
    }>;
    validateCreate(input: ShareCreateRequest, signal?: AbortSignal): Promise<ShareCreateRequest>;
    create(input: ShareCreateRequest, signal?: AbortSignal): Promise<NextcloudShare>;
    validateUpdate(id: number, input: ShareUpdateRequest, signal?: AbortSignal): Promise<{
        current: NextcloudShare;
        update: UpdateShareInput;
    }>;
    update(id: number, input: ShareUpdateRequest, signal?: AbortSignal): Promise<NextcloudShare>;
    delete(id: number, signal?: AbortSignal): Promise<void>;
}
export {};
