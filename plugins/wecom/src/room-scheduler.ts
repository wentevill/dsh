export type RoomSchedulerErrorCode = 'closed' | 'room-full' | 'aborted' | 'drain-timeout'

export class RoomSchedulerError extends Error {
  constructor(readonly code: RoomSchedulerErrorCode) {
    super(`WeCom room scheduler: ${code}`)
    this.name = 'RoomSchedulerError'
  }
}

interface Entry<T = unknown> {
  readonly run: () => Promise<T>
  readonly resolve: (value: T) => void
  readonly reject: (error: unknown) => void
}

export class RoomScheduler {
  readonly #queues = new Map<string, Entry[]>()
  readonly #ready: string[] = []
  readonly #activeRooms = new Set<string>()
  readonly #idleWaiters = new Set<() => void>()
  readonly #concurrency: number
  readonly #perRoomCapacity: number
  #active = 0
  #closed = false

  constructor(options: { readonly concurrency?: number; readonly perRoomCapacity?: number } = {}) {
    this.#concurrency = options.concurrency ?? 4
    this.#perRoomCapacity = options.perRoomCapacity ?? 8
    if (!Number.isInteger(this.#concurrency) || this.#concurrency < 1) throw new TypeError('concurrency must be positive')
    if (!Number.isInteger(this.#perRoomCapacity) || this.#perRoomCapacity < 1) throw new TypeError('perRoomCapacity must be positive')
  }

  enqueue<T>(roomKey: string, run: () => Promise<T>): Promise<T> {
    if (this.#closed) return Promise.reject(new RoomSchedulerError('closed'))
    const queue = this.#queues.get(roomKey) ?? []
    const occupied = queue.length + (this.#activeRooms.has(roomKey) ? 1 : 0)
    if (occupied >= this.#perRoomCapacity) return Promise.reject(new RoomSchedulerError('room-full'))
    const result = new Promise<T>((resolve, reject) => {
      queue.push({ run, resolve, reject } as Entry)
    })
    this.#queues.set(roomKey, queue)
    if (!this.#activeRooms.has(roomKey) && queue.length === 1) this.#ready.push(roomKey)
    this.#pump()
    return result
  }

  abort(): void {
    this.#closed = true
    const error = new RoomSchedulerError('aborted')
    for (const [room, queue] of this.#queues) {
      if (this.#activeRooms.has(room)) {
        for (const entry of queue.splice(0)) entry.reject(error)
      } else {
        for (const entry of queue) entry.reject(error)
        this.#queues.delete(room)
      }
    }
    this.#ready.length = 0
    this.#notifyIdle()
  }

  async drain(timeoutMs?: number): Promise<void> {
    this.#closed = true
    if (this.#isIdle()) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let waiter: (() => void) | undefined
    const idle = new Promise<void>(resolve => {
      waiter = resolve
      this.#idleWaiters.add(resolve)
    })
    const timeout = timeoutMs === undefined
      ? undefined
      : new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new RoomSchedulerError('drain-timeout')), timeoutMs)
        })
    try {
      await (timeout ? Promise.race([idle, timeout]) : idle)
    } finally {
      if (timer) clearTimeout(timer)
      if (waiter) this.#idleWaiters.delete(waiter)
    }
  }

  #pump() {
    while (this.#active < this.#concurrency && this.#ready.length > 0) {
      const room = this.#ready.shift()!
      if (this.#activeRooms.has(room)) continue
      const queue = this.#queues.get(room)
      const entry = queue?.shift()
      if (!entry) { this.#queues.delete(room); continue }
      this.#active += 1
      this.#activeRooms.add(room)
      void entry.run().then(entry.resolve, entry.reject).finally(() => {
        this.#active -= 1
        this.#activeRooms.delete(room)
        const remaining = this.#queues.get(room)
        if (remaining?.length) this.#ready.push(room)
        else this.#queues.delete(room)
        this.#pump()
        this.#notifyIdle()
      })
    }
  }

  #isIdle() { return this.#active === 0 && this.#queues.size === 0 }

  #notifyIdle() {
    if (!this.#isIdle()) return
    for (const resolve of this.#idleWaiters) resolve()
    this.#idleWaiters.clear()
  }
}
