import type { WeComAuthSnapshot } from './auth.ts';
export interface AuthRemoteController {
    snapshot(): WeComAuthSnapshot;
    connect(): Promise<void>;
    cancel(): void;
    refresh(): Promise<void>;
    deleteAuthorization(confirmed: boolean): Promise<void>;
}
/** Transport-neutral facade. Connect returns immediately so the UI can poll for the QR. */
export declare function createAuthRemoteApi(controller: AuthRemoteController): {
    status: () => WeComAuthSnapshot;
    connect(): WeComAuthSnapshot;
    cancel(): WeComAuthSnapshot;
    refresh(): Promise<WeComAuthSnapshot>;
    deleteAuthorization(confirmed: boolean): Promise<WeComAuthSnapshot>;
};
