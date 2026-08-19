/** Non-secret authorization state projected to Plugin configuration. */
export type WeComAuthSnapshot = {
    readonly state: 'unauthorized';
} | {
    readonly state: 'generating_qr';
} | {
    readonly state: 'awaiting_scan';
    readonly qrDataUrl: string;
} | {
    readonly state: 'authorized';
    readonly botId?: string;
} | {
    readonly state: 'refreshing_schema';
    readonly botId?: string;
} | {
    readonly state: 'ready';
    readonly botId?: string;
    readonly toolCount: number;
} | {
    readonly state: 'sync_failed';
    readonly botId?: string;
    readonly message: string;
} | {
    readonly state: 'deleting';
    readonly botId?: string;
};
