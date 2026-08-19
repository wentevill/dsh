import { describe, expect, it } from 'vitest'
import { createRuntimeTool } from '../src/tool-adapter.ts'
import type { DiscoveredMethod } from '../src/discovery.ts'
import type { WeComRunRequest } from '../src/transport.ts'

function method(path: string): DiscoveredMethod {
  return {
    path: path.split('.'), description: path, requestRef: 'Req', responseRef: 'Res',
    schemas: { Req: { type: 'object', properties: { id: { type: 'string' } } }, Res: { type: 'object' } },
  }
}

describe('WeCom runtime tool adapter', () => {
  it('allows reads and returns the canonical CLI value', async () => {
    const calls: WeComRunRequest[] = []
    const tool = createRuntimeTool(method('todo.get'), {
      run: async request => { calls.push(request); return { value: { id: '1' }, stderr: 'diagnostic' } },
    })
    const signal = new AbortController().signal

    expect(tool.preDecision({ id: '1' })).toEqual({ kind: 'allow' })
    await expect(tool.execute({ id: '1' }, signal)).resolves.toEqual({ id: '1' })
    expect(calls).toEqual([{ path: ['todo', 'get'], body: { id: '1' }, signal }])
  })

  it('asks for approval before a mutation', () => {
    const tool = createRuntimeTool(method('message.send'), {
      run: async () => ({ value: {}, stderr: '' }),
    })
    expect(tool.preDecision({ chat_id: 'group-1' })).toEqual({
      kind: 'ask',
      reason: 'Allow WeCom message.send with {"chat_id":"group-1"}?',
    })
  })

  it('asks for approval for an unknown method', () => {
    const tool = createRuntimeTool(method('future.execute'), {
      run: async () => ({ value: {}, stderr: '' }),
    })
    expect(tool.risk).toBe('high-risk')
    expect(tool.preDecision({})).toMatchObject({ kind: 'ask' })
  })
})
