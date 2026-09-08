import type { Context } from '@deepseek-ai/cordis'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  order: [] as string[],
  sessionObserver: undefined as ((session: unknown, event: unknown) => void) | undefined,
}))

vi.mock('@deepseek-ai/dsh-typert-protocol', () => ({
  Remote: () => () => undefined,
  TypertRemoteService: class { constructor() { state.order.push('remote') } },
}))
vi.mock('../lib/store.js', () => ({
  CronStore: class {
    static async open() { state.order.push('store:open'); return new this() }
    recover() { return { activeDefinitions: [], runtime: [], nonterminalExecutions: [], orphanRuntime: [], orphanExecutions: [] } }
    listDefinitions() { return [] }
    async close() { state.order.push('store:close') }
  },
}))
vi.mock('../lib/node-cron-runtime.js', () => ({
  CronLibrary: class { constructor() { state.order.push('library') } },
}))
vi.mock('../lib/commands.js', () => ({
  CronCommandService: class { constructor() { state.order.push('commands') } },
}))
vi.mock('../lib/tracker.js', () => ({
  CronExecutionTracker: class {
    constructor() { state.order.push('tracker') }
    observe() { state.order.push('tracker:observe') }
    async flush() {}
    dispose() { state.order.push('tracker:dispose') }
  },
}))
vi.mock('../lib/execution.js', () => ({
  CronExecutionService: class {
    constructor() { state.order.push('execution') }
    async dispatch() {}
    async recover() { state.order.push('execution:recover') }
    async dispose() { state.order.push('execution:dispose') }
  },
}))
vi.mock('../lib/runtime.js', () => ({
  CronRuntime: class {
    constructor() { state.order.push('runtime') }
    async initialize() { state.order.push('runtime:initialize') }
    async definitionChanged() {}
    async executionFinished() {}
    async dispose() { state.order.push('runtime:dispose') }
  },
}))
vi.mock('../lib/tools.js', () => ({
  createCronTools: () => Array.from({ length: 8 }, (_, index) => ({ name: `cron_${index}` })),
}))
vi.mock('../lib/approval.js', () => ({ createCronApprovalPolicy: () => async () => ({ kind: 'allow' }) }))

function harness() {
  const disposers: Array<() => void | Promise<void>> = []
  const ctx = {
    storageDomain: {}, workspaceRegistry: {}, sessionController: {},
    permissionPresets: {}, agentPresets: {}, sessions: {},
    tools: {
      register(tool: { name: string }) {
        state.order.push(`tool:register:${tool.name}`)
        return () => { state.order.push(`tool:dispose:${tool.name}`) }
      },
    },
    on(name: string, listener: (...args: never[]) => unknown) {
      state.order.push(`on:${name}`)
      if (name === 'session/event') state.sessionObserver = listener as never
      return () => { state.order.push(`off:${name}`) }
    },
    effect(register: () => () => void | Promise<void>, label: string) {
      state.order.push(`effect:${label}`)
      disposers.push(register())
    },
  }
  return {
    ctx: ctx as unknown as Context,
    async dispose() {
      for (const dispose of disposers.reverse()) await dispose()
    },
  }
}

describe('Cron Host composition', () => {
  beforeEach(() => { state.order.length = 0; state.sessionObserver = undefined })

  it('declares only the exact public services it consumes', async () => {
    const cron = await import('../lib/index.js')
    expect(cron.inject).toEqual([
      'tools', 'storageDomain', 'workspaceRegistry', 'sessionController',
      'permissionPresets', 'agentPresets', 'sessions',
    ])
  })

  it('opens storage before timers and tools, observes Sessions, then disposes in reverse', async () => {
    const cron = await import('../lib/index.js')
    const { ctx, dispose } = harness()
    await cron.apply(ctx)

    expect(state.order.indexOf('store:open')).toBeLessThan(state.order.indexOf('runtime:initialize'))
    expect(state.order.indexOf('runtime:initialize')).toBeLessThan(state.order.indexOf('tool:register:cron_0'))
    state.sessionObserver?.({ id: 'session-1' }, { type: 'turn/start' })
    expect(state.order).toContain('tracker:observe')

    await dispose()
    expect(state.order.indexOf('runtime:dispose')).toBeLessThan(state.order.indexOf('execution:dispose'))
    expect(state.order.indexOf('execution:dispose')).toBeLessThan(state.order.indexOf('store:close'))
    expect(state.order.filter(value => value.startsWith('tool:dispose:'))).toHaveLength(8)
    expect(state.order).toContain('off:tools/pre-execute')
    expect(state.order).toContain('off:session/event')
  })
})
