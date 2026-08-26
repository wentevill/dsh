export type ShareTarget = 'publicLink' | 'user' | 'group';
export type ShareProfile = 'read' | 'edit' | 'fileDrop';
export interface NextcloudShare {
    readonly id: number;
    readonly path: string;
    readonly target: ShareTarget;
    readonly recipient?: string;
    readonly profile: ShareProfile;
    readonly permissions: number;
    readonly url?: string;
    readonly token?: string;
    readonly expireDate?: string;
    readonly note?: string;
    readonly label?: string;
}
export interface NextcloudSharee {
    readonly id: string;
    readonly label: string;
    readonly type: 'user' | 'group';
    readonly category: 'person' | 'department';
}
export interface CreateShareInput {
    readonly path: string;
    readonly target: ShareTarget;
    readonly recipient?: string;
    readonly profile: ShareProfile;
    readonly password?: string;
    readonly expireDate?: string;
    readonly note?: string;
    readonly label?: string;
}
export interface UpdateShareInput {
    readonly permissions?: number;
    readonly publicUpload?: boolean;
    readonly password?: string;
    readonly expireDate?: string;
    readonly note?: string;
}
export declare const SHARE_PERMISSIONS: Readonly<Record<ShareProfile, number>>;
