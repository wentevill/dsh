import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
export const roomRecordSchema = z.object({
    botDigest: z.string().min(1).transform(value => value),
    kind: z.enum(['direct', 'group']),
    sessionId: z.string().min(1).transform(value => value),
    createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    lastUsedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(record => record.lastUsedAt >= record.createdAt, {
    path: ['lastUsedAt'],
    message: 'lastUsedAt must not precede createdAt',
});
export const wecomRoomSessionsSpec = defineDomain({
    name: 'wecom_room_sessions',
    version: 1,
    tables: {
        rooms: domainTable(roomRecordSchema),
    },
});
