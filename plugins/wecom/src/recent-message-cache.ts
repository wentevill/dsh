export interface RecentMessageCacheOptions {
  readonly maxEntries?: number
  readonly ttlMs?: number
  readonly now?: () => number
}

export class RecentMessageCache {
  readonly #entries = new Map<string, number>()
  readonly #maxEntries: number
  readonly #ttlMs: number
  readonly #now: () => number

  constructor(options: RecentMessageCacheOptions = {}) {
    this.#maxEntries = options.maxEntries ?? 1024
    this.#ttlMs = options.ttlMs ?? 10 * 60_000
    this.#now = options.now ?? Date.now
    if (!Number.isInteger(this.#maxEntries) || this.#maxEntries < 1) {
      throw new TypeError('maxEntries must be a positive integer')
    }
  }

  get size() { return this.#entries.size }

  accept(botId: string, messageId: string): boolean {
    const now = this.#now()
    this.#prune(now)
    const key = `${botId}\0${messageId}`
    const expiresAt = this.#entries.get(key)
    if (expiresAt !== undefined && expiresAt > now) return false
    this.#entries.delete(key)
    this.#entries.set(key, now + this.#ttlMs)
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.keys().next().value as string | undefined
      if (oldest === undefined) break
      this.#entries.delete(oldest)
    }
    return true
  }

  #prune(now: number) {
    for (const [key, expiresAt] of this.#entries) {
      if (expiresAt > now) continue
      this.#entries.delete(key)
    }
  }
}
