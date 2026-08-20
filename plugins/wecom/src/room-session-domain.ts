import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { z } from 'zod'

export type RoomDigest = string & { readonly __roomDigest: unique symbol }
export type BotDigest = string & { readonly __botDigest: unique symbol }

export const roomRecordSchema = z.object({
  botDigest: z.string().min(1).transform(value => value as BotDigest),
  kind: z.enum(['direct', 'group']),
  sessionId: z.string().min(1).transform(value => value as SessionId),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lastUsedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().refine(record => record.lastUsedAt >= record.createdAt, {
  path: ['lastUsedAt'],
  message: 'lastUsedAt must not precede createdAt',
})

export type RoomRecord = z.infer<typeof roomRecordSchema>

export const wecomRoomSessionsSpec = defineDomain({
  name: 'wecom_room_sessions',
  version: 1,
  tables: {
    rooms: domainTable<RoomDigest, RoomRecord>(roomRecordSchema),
  },
})
