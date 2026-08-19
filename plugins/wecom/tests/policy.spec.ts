import { describe, expect, it } from 'vitest'
import { approvalReason, classifyOperation } from '../src/policy.ts'
import type { DiscoveredMethod } from '../src/discovery.ts'

function method(path: string): DiscoveredMethod {
  return { path: path.split('.'), responseRef: 'Res', schemas: { Res: { type: 'object' } } }
}

describe('WeCom operation policy', () => {
  it.each([
    ['identity.whoami', 'read'],
    ['message.aibot.sessions.list', 'read'],
    ['doc.search', 'read'],
    ['todo.get', 'read'],
    ['message.send', 'write'],
    ['calendar.create', 'write'],
    ['todo.update', 'write'],
    ['doc.contents.append', 'write'],
    ['doc.contents.overwrite', 'high-risk'],
    ['todo.delete', 'high-risk'],
    ['meeting.cancel', 'high-risk'],
    ['doc.members.update', 'high-risk'],
    ['future.execute', 'high-risk'],
  ] as const)('classifies %s as %s', (path, expected) => {
    expect(classifyOperation(method(path))).toBe(expected)
  })

  it('honors an explicit x-wecom-confirm directive', () => {
    const candidate: DiscoveredMethod = {
      path: ['special', 'get'],
      requestRef: 'Req',
      responseRef: 'Res',
      schemas: { Req: { type: 'object', 'x-wecom-confirm': true }, Res: { type: 'object' } },
    }
    expect(classifyOperation(candidate)).toBe('write')
  })

  it('builds a bounded approval reason without secret-bearing fields', () => {
    expect(approvalReason(method('message.send'), {
      chat_id: 'group-1',
      content: 'release at 18:00',
      access_token: 'must-not-appear',
      secret: 'must-not-appear',
    })).toBe('Allow WeCom message.send with {"chat_id":"group-1","content":"release at 18:00"}?')
  })
})
