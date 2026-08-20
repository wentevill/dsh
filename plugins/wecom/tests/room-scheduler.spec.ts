import { describe, expect, it } from 'vitest'
import { RoomScheduler, RoomSchedulerError } from '../src/room-scheduler.js'

const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('RoomScheduler', () => {
  it('runs one room FIFO and different rooms up to the global bound', async () => {
    const scheduler = new RoomScheduler({ concurrency: 2, perRoomCapacity: 4 })
    const gateA = deferred()
    const gateB = deferred()
    const order: string[] = []
    const a1 = scheduler.enqueue('a', async () => { order.push('a1-start'); await gateA.promise; order.push('a1-end') })
    const a2 = scheduler.enqueue('a', async () => { order.push('a2') })
    const b1 = scheduler.enqueue('b', async () => { order.push('b1-start'); await gateB.promise; order.push('b1-end') })
    await Promise.resolve()
    expect(order).toEqual(['a1-start', 'b1-start'])
    gateA.resolve(); await a1; await a2
    expect(order).toContain('a2')
    gateB.resolve(); await b1
    await scheduler.drain()
  })

  it('rejects overflow and queued work aborted by close', async () => {
    const scheduler = new RoomScheduler({ concurrency: 1, perRoomCapacity: 1 })
    const gate = deferred()
    const running = scheduler.enqueue('a', () => gate.promise)
    await expect(scheduler.enqueue('a', async () => {})).rejects.toMatchObject({ code: 'room-full' })
    const queued = scheduler.enqueue('b', async () => {})
    scheduler.abort()
    await expect(queued).rejects.toMatchObject({ code: 'aborted' })
    gate.resolve(); await running
    await scheduler.drain()
    await expect(scheduler.enqueue('c', async () => {})).rejects.toBeInstanceOf(RoomSchedulerError)
  })

  it('reports a bounded drain timeout without detaching active work', async () => {
    const scheduler = new RoomScheduler({ concurrency: 1, perRoomCapacity: 2 })
    const gate = deferred()
    const running = scheduler.enqueue('a', () => gate.promise)
    await expect(scheduler.drain(1)).rejects.toMatchObject({ code: 'drain-timeout' })
    gate.resolve(); await running
    await scheduler.drain()
  })
})
