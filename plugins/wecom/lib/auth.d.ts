/** Non-secret result of querying wecom-cli authorization. */
export interface AuthStatus {
    readonly authorized: boolean;
    readonly botId?: string;
}
/** Host-only operations needed by the authorization state machine. */
export interface AuthBackend {
    status(): Promise<AuthStatus>;
    connect(options: {
        readonly signal: AbortSignal;
        readonly onQr: (dataUrl: string) => void;
    }): Promise<void>;
    deleteOwnedAuthorization(): Promise<void>;
}
export type { WeComAuthSnapshot } from './remote-types.ts';
import type { WeComAuthSnapshot } from './remote-types.ts';
interface AuthControllerOptions {
    readonly backend: AuthBackend;
    readonly refreshTools: () => Promise<number>;
    readonly clearTools: () => Promise<void>;
}
/** Stateful authorization controller shared by the Host Remote and tool catalog. */
export declare function createWeComAuthController(options: AuthControllerOptions): {
    snapshot(): WeComAuthSnapshot;
    subscribe(listener: (snapshot: WeComAuthSnapshot) => void): () => void;
    initialize(): Promise<void>;
    connect(): Promise<void>;
    cancel(): void;
    refresh(): Promise<void>;
    deleteAuthorization(confirmed: boolean): Promise<void>;
};
