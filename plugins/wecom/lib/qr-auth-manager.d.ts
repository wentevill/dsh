export type QrAuthErrorCode = 'cancelled' | 'expired' | 'upstream' | 'invalid-response';
export declare class QrAuthError extends Error {
    readonly code: QrAuthErrorCode;
    constructor(code: QrAuthErrorCode);
}
export interface QrAuthManager {
    connect(options: {
        readonly signal: AbortSignal;
        readonly onQr: (dataUrl: string) => void;
    }): Promise<{
        readonly botId: string;
        readonly secret: string;
    }>;
    cancel(): void;
}
export interface QrAuthManagerOptions {
    readonly fetch?: (url: URL, init: RequestInit) => Promise<Response>;
    readonly toQrDataUrl: (value: string) => Promise<string>;
    readonly generateUrl?: string;
    readonly queryUrl?: string;
    readonly pollIntervalMs?: number;
    readonly ttlMs?: number;
    readonly requestTimeoutMs?: number;
    readonly maxResponseBytes?: number;
    readonly now?: () => number;
}
export declare function createQrAuthManager(options: QrAuthManagerOptions): QrAuthManager;
