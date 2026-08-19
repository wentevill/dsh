import { describe, expect, it } from 'vitest'
import { filterAvailableMethods } from '../src/capabilities.ts'
import type { DiscoveredMethod } from '../src/discovery.ts'
import { WeComCliError, type WeComRunRequest } from '../src/transport.ts'

function method(path: string): DiscoveredMethod {
  return { path: path.split('.'), responseRef: 'Response', schemas: { Response: { type: 'object' } } }
}

describe('WeCom capability filtering', () => {
  it('suppresses chat tools when the corporation does not provide chat history', async () => {
    const calls: WeComRunRequest[] = []
    const result = await filterAvailableMethods(
      [method('chat.groups.list'), method('chat.messages.get'), method('todo.list')],
      { run: async request => {
        calls.push(request)
        throw new WeComCliError('this tool is not available for your corporation', 1, 853006)
      } },
      () => new Date(2026, 7, 19, 10, 0, 0),
    )

    expect(result.methods.map(item => item.path.join('.'))).toEqual(['todo.list'])
    expect(result.warnings).toEqual(['chat: this tool is not available for your corporation'])
    expect(calls).toEqual([{
      path: ['chat', 'groups', 'list'],
      body: { begin_time: '2026-08-18 10:00:00', end_time: '2026-08-19 10:00:00' },
    }])
  })

  it('retains tools after authorization and transient failures so their actionable errors remain visible', async () => {
    for (const error of [
      new WeComCliError('请申请授权\nhttps://example.test/grant', 1, 851008),
      new Error('temporary network failure'),
    ]) {
      const methods = [method('chat.groups.list'), method('contact.users.search'), method('doc.search')]
      const result = await filterAvailableMethods(methods, { run: async () => { throw error } })
      expect(result.methods).toEqual(methods)
      expect(result.warnings).toHaveLength(1)
    }
  })

  it('does not probe when the catalog contains no chat tools', async () => {
    let calls = 0
    const methods = [method('identity.whoami'), method('todo.list')]
    const result = await filterAvailableMethods(methods, {
      run: async () => { calls += 1; return { value: {}, stderr: '' } },
    })
    expect(result.methods).toEqual(methods)
    expect(result.warnings).toEqual([])
    expect(calls).toBe(0)
  })
})
