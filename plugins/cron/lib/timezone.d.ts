import type { SessionEvent } from '@deepseek-ai/dsh-session';
/** Derive one canonical browser timezone from ordinary RPC messages in the open turn. */
export declare function timezoneForOpenTurn(events: readonly SessionEvent[]): string;
/** Return the platform-canonical IANA timezone, or undefined when invalid. */
export declare function canonicalTimeZone(candidate: string): string | undefined;
