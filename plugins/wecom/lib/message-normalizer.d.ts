import type { InboundEnvelope } from './channel-types.js';
export type InboundMessageErrorCode = 'invalid' | 'unsupported' | 'too_large' | 'timeout' | 'aborted';
export declare class InboundMessageError extends Error {
    readonly code: InboundMessageErrorCode;
    constructor(code: InboundMessageErrorCode);
}
interface Limits {
    readonly maxAttachmentBytes: number;
    readonly maxTotalBytes: number;
    readonly downloadTimeoutMs: number;
}
interface NormalizeOptions {
    readonly download: (url: string, aesKey?: string) => Promise<{
        buffer: Uint8Array;
        filename?: string;
    }>;
    readonly limits?: Partial<Limits>;
    readonly signal?: AbortSignal;
}
export declare function normalizeInbound(input: unknown, options: NormalizeOptions): Promise<InboundEnvelope>;
export {};
