import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { RoomDigest, RoomRecord } from './room-session-domain.js';
export interface RoomIdentity {
    readonly botId: string;
    readonly kind: 'direct' | 'group';
    readonly id: string;
}
export interface RoomSessionStoreOptions {
    readonly table: KvTable<RoomDigest, RoomRecord>;
    readonly salt: Uint8Array;
    readonly sessionExists: (id: SessionId) => Promise<boolean>;
    readonly createSessionId: () => Promise<SessionId>;
    readonly now?: () => number;
}
export declare class RoomSessionStore {
    #private;
    constructor(options: RoomSessionStoreOptions);
    resolve(room: RoomIdentity): Promise<SessionId>;
    close(): Promise<void>;
}
