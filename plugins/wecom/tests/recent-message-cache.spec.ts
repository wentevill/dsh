import { describe, expect, it } from 'vitest'
import { RecentMessageCache } from '../src/recent-message-cache.js'

describe('RecentMessageCache', () => {
  it('deduplicates per bot until TTL expiry', () => {
    let now = 1000
    const cache = new RecentMessageCache({ maxEntries: 2, ttlMs: 100, now: () => now })
    expect(cache.accept('bot-a', 'one')).toBe(true)
    expect(cache.accept('bot-a', 'one')).toBe(false)
    expect(cache.accept('bot-b', 'one')).toBe(true)
    now += 101
    expect(cache.accept('bot-a', 'one')).toBe(true)
  })

  it('evicts the oldest entry at a strict bound', () => {
    let now = 0
    const cache = new RecentMessageCache({ maxEntries: 2, ttlMs: 1000, now: () => ++now })
    cache.accept('bot', 'one')
    cache.accept('bot', 'two')
    cache.accept('bot', 'three')
    expect(cache.size).toBe(2)
    expect(cache.accept('bot', 'one')).toBe(true)
  })
})
