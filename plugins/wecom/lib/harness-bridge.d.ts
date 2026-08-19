import { createUserMessage, type ContentBlock } from '@deepseek-ai/dsh-llm';
import type { Session, SessionId } from '@deepseek-ai/dsh-session';
import type { Context } from '@deepseek-ai/cordis';
import type { InboundEnvelope, NormalizedInboundBlock } from './channel-types.js';
import { RoomScheduler } from './room-scheduler.js';
import type { RoomSessionStore } from './room-session-store.js';
export type HarnessBridgeErrorCode = 'aborted' | 'turn-failed' | 'empty-response' | 'reply-failed' | 'disposed';
export declare class HarnessBridgeError extends Error {
    readonly code: HarnessBridgeErrorCode;
    constructor(code: HarnessBridgeErrorCode);
}
export interface BridgeAgent {
    readonly session: Pick<Session, 'seq' | 'events'>;
    followup(message: ReturnType<typeof createUserMessage>): void;
    whenIdle(): Promise<void>;
}
export interface HarnessBridgeRuntime {
    agentFor(sessionId: SessionId, signal: AbortSignal): Promise<{
        readonly agent: BridgeAgent;
        readonly dispose?: () => Promise<void>;
    }>;
    materializeContent(blocks: readonly NormalizedInboundBlock[], signal: AbortSignal): Promise<ContentBlock[]>;
    flush(session: BridgeAgent['session']): Promise<void>;
}
export interface HarnessBridgeOptions {
    readonly scheduler: RoomScheduler;
    readonly roomSessions: RoomSessionStore;
    readonly runtime: HarnessBridgeRuntime;
    readonly reply: (context: unknown, streamId: string, content: string, finish: boolean) => Promise<void>;
    readonly createStreamId: () => string;
}
/** Build the production bridge boundary from Harness services. */
export declare function createHarnessBridgeRuntime(ctx: Context): HarnessBridgeRuntime;
export declare class HarnessBridge {
    #private;
    constructor(options: HarnessBridgeOptions);
    handle(envelope: InboundEnvelope, signal: AbortSignal): Promise<void>;
    dispose(): Promise<void>;
}
