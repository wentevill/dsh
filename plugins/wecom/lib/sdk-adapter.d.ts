import { type WSClientOptions, type WsFrameHeaders } from '@wecom/aibot-node-sdk';
import type { SdkClientFactory, SdkErrorCategory } from './channel-types.js';
interface OfficialClient {
    connect(): unknown;
    disconnect(): void;
    on(event: string, listener: (...args: any[]) => void): unknown;
    off(event: string, listener: (...args: any[]) => void): unknown;
    replyStream(frame: WsFrameHeaders, streamId: string, content: string, finish: boolean): Promise<unknown>;
    downloadFile(url: string, aesKey?: string): Promise<{
        buffer: Uint8Array;
        filename?: string;
    }>;
}
type OfficialClientConstructor = new (options: WSClientOptions) => OfficialClient;
export interface CategorizedSdkError extends Error {
    readonly category: SdkErrorCategory;
}
export declare function categorizeSdkError(error: unknown): CategorizedSdkError;
export declare function createSdkClientFactory(options?: {
    Client?: OfficialClientConstructor;
}): SdkClientFactory;
export {};
