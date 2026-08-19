import { describe, expect, it } from 'vitest'
import { discoverWeComMethods } from '../src/discovery.ts'
import type { JsonValue, WeComRunRequest, WeComRunResult } from '../src/transport.ts'

function runner(results: Record<string, JsonValue>) {
  const calls: WeComRunRequest[] = []
  return {
    calls,
    run: async (request: WeComRunRequest): Promise<WeComRunResult> => {
      calls.push(request)
      const key = request.path.join(' ')
      const value = results[key]
      if (value === undefined) throw new Error(`unexpected command: ${key}`)
      return { value, stderr: '' }
    },
  }
}

describe('WeCom schema discovery', () => {
  it('expands service summaries into full method schemas', async () => {
    const cli = runner({
      'schema list': [{ name: 'contact', description: '通讯录', skills: [], methods: [
        { name: 'users.search', description: '搜索成员' },
      ] }],
      'schema get contact.users.search': {
        method: 'contact.users.search',
        description: '搜索成员',
        request: { '$ref': 'SearchReq' },
        response: { '$ref': 'SearchRes' },
        schemas: {
          SearchReq: { type: 'object', required: ['keywords'], properties: { keywords: { type: 'array', items: { type: 'string' } } } },
          SearchRes: { type: 'object', properties: { users: { type: 'array', items: { type: 'object' } } } },
        },
      },
    })

    await expect(discoverWeComMethods(cli)).resolves.toEqual([{
      path: ['contact', 'users', 'search'],
      description: '搜索成员',
      requestRef: 'SearchReq',
      responseRef: 'SearchRes',
      schemas: {
        SearchReq: { type: 'object', required: ['keywords'], properties: { keywords: { type: 'array', items: { type: 'string' } } } },
        SearchRes: { type: 'object', properties: { users: { type: 'array', items: { type: 'object' } } } },
      },
    }])
    expect(cli.calls.map(call => call.path)).toEqual([
      ['schema', 'list'],
      ['schema', 'get', 'contact.users.search'],
    ])
  })

  it('uses the full method name emitted by the real service catalog', async () => {
    const cli = runner({
      'schema list': [{ name: 'calendar', methods: [
        { name: 'calendar.schedules.cancel', description: '取消日程' },
      ] }],
      'schema get calendar.schedules.cancel': {
        method: 'calendar.schedules.cancel',
        response: { '$ref': 'CancelRes' },
        schemas: { CancelRes: { type: 'object' } },
      },
    })

    await expect(discoverWeComMethods(cli)).resolves.toMatchObject([{
      path: ['calendar', 'schedules', 'cancel'],
    }])
    expect(cli.calls.map(call => call.path)).toEqual([
      ['schema', 'list'],
      ['schema', 'get', 'calendar.schedules.cancel'],
    ])
  })

  it('rejects a method whose detailed path disagrees with the catalog', async () => {
    const cli = runner({
      'schema list': [{ name: 'contact', methods: [{ name: 'users.search' }] }],
      'schema get contact.users.search': {
        method: 'message.send', response: { '$ref': 'Res' }, schemas: { Res: { type: 'object' } },
      },
    })
    await expect(discoverWeComMethods(cli)).rejects.toThrow('method path mismatch')
  })

  it('rejects malformed service catalog output', async () => {
    const cli = runner({ 'schema list': { services: [] } })
    await expect(discoverWeComMethods(cli)).rejects.toThrow('schema list must return an array')
  })
})
