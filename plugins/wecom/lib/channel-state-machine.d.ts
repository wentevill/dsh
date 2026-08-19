import type { SdkClient, SdkClientFactory, WeComChannelSnapshot } from './channel-types.js';
export interface ChannelController {
    start(credentials: {
        readonly botId: string;
        readonly secret: string;
    }): Promise<void>;
    stop(): Promise<void>;
    snapshot(): WeComChannelSnapshot;
    subscribe(listener: (snapshot: WeComChannelSnapshot) => void): () => void;
}
export interface ChannelControllerOptions {
    readonly factory: SdkClientFactory;
    readonly random?: () => number;
    readonly now?: () => number;
    readonly stableAfterMs?: number;
    readonly subscribeNetworkRestored?: (listener: () => void) => () => void;
    readonly onMessage?: (frame: unknown, signal: AbortSignal, client: SdkClient) => void | Promise<void>;
}
export declare function createChannelController(options: ChannelControllerOptions): ChannelController;
