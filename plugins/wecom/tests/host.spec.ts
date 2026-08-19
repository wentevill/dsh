import { describe, expect, it } from 'vitest'
import { createWeComHost } from '../src/host.ts'
import type { AuthBackend } from '../src/auth.ts'
import type { DynamicToolDefinition } from '../src/catalog.ts'
import type { JsonValue, WeComRunRequest, WeComRunResult } from '../src/transport.ts'

function runner(values: Record<string, JsonValue>) {
  return {
    run: async (request: WeComRunRequest): Promise<WeComRunResult> => ({
      value: values[request.path.join(' ')] as JsonValue,
      stderr: '',
    }),
  }
}

const unauthorized: AuthBackend = {
  status: async () => ({ authorized: false }),
  connect: async () => {},
  deleteOwnedAuthorization: async () => {},
}

describe('WeCom Host orchestration', () => {
  it('registers no business tools while unauthorized', async () => {
    let installs = 0
    const host = createWeComHost({
      authBackend: unauthorized,
      runner: runner({}),
      installTools: () => { installs += 1; return () => {} },
    })
    await host.initialize()
    expect(host.auth.snapshot()).toEqual({ state: 'unauthorized' })
    expect(installs).toBe(0)
  })

  it('discovers and installs tools for an authorized account', async () => {
    const installed: DynamicToolDefinition[][] = []
    const host = createWeComHost({
      authBackend: { ...unauthorized, status: async () => ({ authorized: true }) },
      runner: runner({
        'schema list': [{ name: 'todo', methods: [{ name: 'list', description: 'List todos' }] }],
        'schema get todo.list': {
          method: 'todo.list', description: 'List todos', response: { '$ref': 'Res' },
          schemas: { Res: { type: 'object' } },
        },
      }),
      installTools: definitions => { installed.push([...definitions]); return () => {} },
    })
    await host.initialize()
    expect(host.auth.snapshot()).toEqual({ state: 'ready', toolCount: 1 })
    expect(installed[0]?.map(tool => tool.name)).toEqual(['wecom_todo_list'])
  })
})
