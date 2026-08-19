export interface RecentMessageCacheOptions {
    readonly maxEntries?: number;
    readonly ttlMs?: number;
    readonly now?: () => number;
}
export declare class RecentMessageCache {
    #private;
    constructor(options?: RecentMessageCacheOptions);
    get size(): number;
    accept(botId: string, messageId: string): boolean;
}
