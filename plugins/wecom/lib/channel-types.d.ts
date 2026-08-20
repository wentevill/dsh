export type ChannelState = 'stopped' | 'connecting' | 'subscribing' | 'connected' | 'reconnect_wait' | 'auth_failed' | 'failed';
export type NormalizedInboundBlock = {
    readonly type: 'text';
    readonly text: string;
} | {
    readonly type: 'attachment';
    readonly mediaType: 'image' | 'file';
    readonly bytes: Uint8Array;
    readonly filename?: string;
};
export interface InboundEnvelope {
    readonly requestId: string;
    readonly messageId: string;
    readonly botId: string;
    readonly room: {
        readonly kind: 'direct' | 'group';
        readonly id: string;
    };
    readonly senderId: string;
    readonly content: readonly NormalizedInboundBlock[];
    readonly replyContext: unknown;
}
export interface WeComChannelSnapshot {
    readonly state: ChannelState;
    readonly attempt: number;
    readonly nextRetryAt?: number;
    readonly error?: {
        readonly category: SdkErrorCategory;
        readonly message: string;
    };
}
export type SdkErrorCategory = 'auth' | 'network' | 'timeout' | 'permanent';
export interface SdkEventMap {
    connected: [];
    authenticated: [];
    disconnected: [reason: string];
    reconnecting: [attempt: number];
    error: [error: Error];
    message: [frame: unknown];
}
export interface SdkClient {
    connect(): void;
    disconnect(): void;
    on<K extends keyof SdkEventMap>(event: K, listener: (...args: SdkEventMap[K]) => void): () => void;
    reply(context: unknown, streamId: string, content: string, finish: boolean): Promise<void>;
    download(url: string, aesKey?: string): Promise<{
        buffer: Uint8Array;
        filename?: string;
    }>;
}
export interface SdkClientFactory {
    create(credentials: {
        readonly botId: string;
        readonly secret: string;
    }): SdkClient;
}
