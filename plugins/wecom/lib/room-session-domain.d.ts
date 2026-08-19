import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { z } from 'zod';
export type RoomDigest = string & {
    readonly __roomDigest: unique symbol;
};
export type BotDigest = string & {
    readonly __botDigest: unique symbol;
};
export declare const roomRecordSchema: z.ZodObject<{
    botDigest: z.ZodPipe<z.ZodString, z.ZodTransform<BotDigest, string>>;
    kind: z.ZodEnum<{
        direct: "direct";
        group: "group";
    }>;
    sessionId: z.ZodPipe<z.ZodString, z.ZodTransform<SessionId, string>>;
    createdAt: z.ZodNumber;
    lastUsedAt: z.ZodNumber;
}, z.core.$strict>;
export type RoomRecord = z.infer<typeof roomRecordSchema>;
export declare const wecomRoomSessionsSpec: {
    name: string;
    version: number;
    tables: {
        rooms: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<RoomDigest, {
            botDigest: BotDigest;
            kind: "direct" | "group";
            sessionId: SessionId;
            createdAt: number;
            lastUsedAt: number;
        }>;
    };
};
