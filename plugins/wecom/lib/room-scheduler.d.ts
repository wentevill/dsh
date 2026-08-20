export type RoomSchedulerErrorCode = 'closed' | 'room-full' | 'aborted' | 'drain-timeout';
export declare class RoomSchedulerError extends Error {
    readonly code: RoomSchedulerErrorCode;
    constructor(code: RoomSchedulerErrorCode);
}
export declare class RoomScheduler {
    #private;
    constructor(options?: {
        readonly concurrency?: number;
        readonly perRoomCapacity?: number;
    });
    enqueue<T>(roomKey: string, run: () => Promise<T>): Promise<T>;
    abort(): void;
    drain(timeoutMs?: number): Promise<void>;
}
