import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { cronFailure } from './errors.ts'

/** Derive one canonical browser timezone from ordinary RPC messages in the open turn. */
export function timezoneForOpenTurn(events: readonly SessionEvent[]): string {
  const boundary = events.findLastIndex(event => event.type === 'turn/end')
  const zones = events.slice(boundary + 1).flatMap((event) => {
    if (event.type !== 'user/message') return []
    const source = event.data.source
    if (source.kind !== 'user' || !('rpcId' in source) || !('clientTimeZone' in source)) return []
    const candidate = source.clientTimeZone
    if (typeof candidate !== 'string') return []
    const canonical = canonicalTimeZone(candidate)
    return canonical === candidate ? [canonical] : []
  })
  const unique = new Set(zones)
  if (unique.size !== 1) {
    throw cronFailure('invalid_timezone')
  }
  return zones[0]!
}

/** Return the platform-canonical IANA timezone, or undefined when invalid. */
export function canonicalTimeZone(candidate: string): string | undefined {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: candidate })
      .resolvedOptions().timeZone
  } catch {
    return undefined
  }
}
