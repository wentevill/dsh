import { describe, expect, it } from 'vitest'
import { WeComCliError, createNodeProcessExecutor, createWeComProcessRunner, type ProcessInvocation } from '../src/transport.ts'

function executor(result: { code: number; stdout: string; stderr?: string }) {
  const calls: ProcessInvocation[] = []
  return {
    calls,
    execute: async (invocation: ProcessInvocation) => {
      calls.push(invocation)
      return { code: result.code, stdout: result.stdout, stderr: result.stderr ?? '' }
    },
  }
}

describe('WeCom process transport', () => {
  it('uses argv and profile-confined directories to invoke a business method', async () => {
    const fake = executor({ code: 0, stdout: '{"users":[]}' })
    const runner = createWeComProcessRunner({
      executable: '/plugin/bin/wecom-cli',
      configDir: '/profile/plugins/wecom',
      tempDir: '/profile/plugins/wecom/tmp',
      execute: fake.execute,
    })

    await expect(runner.run({
      path: ['contact', 'users', 'search'],
      body: { keywords: ['张三'] },
    })).resolves.toEqual({ value: { users: [] }, stderr: '' })

    expect(fake.calls).toEqual([{
      executable: '/plugin/bin/wecom-cli',
      args: ['contact', 'users', 'search', '--json', '{"keywords":["张三"]}'],
      cwd: '/profile/plugins/wecom/tmp',
      env: {
        WECOM_CLI_CONFIG_DIR: '/profile/plugins/wecom',
        WECOM_CLI_TMP_DIR: '/profile/plugins/wecom/tmp',
      },
      maxOutputBytes: 1_048_576,
      timeoutMs: 30_000,
      signal: undefined,
    }])
  })

  it('parses paginated NDJSON as an array of pages', async () => {
    const fake = executor({ code: 0, stdout: '{"page":1}\n{"page":2}\n' })
    const runner = createWeComProcessRunner({
      executable: 'wecom-cli', configDir: '/config', tempDir: '/tmp/wecom', execute: fake.execute,
    })

    await expect(runner.run({ path: ['todo', 'list'] })).resolves.toEqual({
      value: [{ page: 1 }, { page: 2 }],
      stderr: '',
    })
  })

  it('parses pretty-printed JSON as one document', async () => {
    const fake = executor({ code: 0, stdout: '[\n  {\n    "name": "calendar"\n  }\n]\n' })
    const runner = createWeComProcessRunner({
      executable: 'wecom-cli', configDir: '/config', tempDir: '/tmp/wecom', execute: fake.execute,
    })

    await expect(runner.run({ path: ['schema', 'list'] })).resolves.toEqual({
      value: [{ name: 'calendar' }],
      stderr: '',
    })
  })

  it('maps a structured CLI failure without returning stderr as model data', async () => {
    const fake = executor({
      code: 1,
      stdout: '{"error":{"type":"AuthError","code":893201,"message":"unauthorized"}}',
      stderr: 'token=secret diagnostic',
    })
    const runner = createWeComProcessRunner({
      executable: 'wecom-cli', configDir: '/config', tempDir: '/tmp/wecom', execute: fake.execute,
    })

    await expect(runner.run({ path: ['identity', 'whoami'] })).rejects.toMatchObject({
      name: 'WeComCliError',
      exitCode: 1,
      code: 893201,
      message: 'unauthorized',
    })
  })

  it('preserves top-level WeCom authorization guidance verbatim', async () => {
    const helpMessage = '授权说明\nhttps://example.test/grant'
    const fake = executor({
      code: 1,
      stdout: JSON.stringify({
        errcode: 851008,
        errmsg: 'partial no authorization',
        help_message: helpMessage,
      }),
    })
    const runner = createWeComProcessRunner({
      executable: 'wecom-cli', configDir: '/config', tempDir: '/tmp/wecom', execute: fake.execute,
    })

    await expect(runner.run({ path: ['doc', 'search'] })).rejects.toMatchObject({
      name: 'WeComCliError',
      exitCode: 1,
      code: 851008,
      message: helpMessage,
    })
  })

  it('uses the top-level WeCom error message when no guidance is present', async () => {
    const fake = executor({
      code: 1,
      stdout: JSON.stringify({
        errcode: 853006,
        errmsg: 'this tool is not available for your corporation',
      }),
    })
    const runner = createWeComProcessRunner({
      executable: 'wecom-cli', configDir: '/config', tempDir: '/tmp/wecom', execute: fake.execute,
    })

    await expect(runner.run({ path: ['chat', 'groups', 'list'] })).rejects.toMatchObject({
      name: 'WeComCliError',
      exitCode: 1,
      code: 853006,
      message: 'this tool is not available for your corporation',
    })
  })

  it('rejects empty and malformed successful output', async () => {
    for (const stdout of ['', 'not-json']) {
      const fake = executor({ code: 0, stdout })
      const runner = createWeComProcessRunner({
        executable: 'wecom-cli', configDir: '/config', tempDir: '/tmp/wecom', execute: fake.execute,
      })
      await expect(runner.run({ path: ['schema', 'list'] })).rejects.toThrow('invalid JSON output')
    }
  })
})

describe('Node process executor', () => {
  it('captures a shell-free child process result', async () => {
    const execute = createNodeProcessExecutor()
    await expect(execute({
      executable: process.execPath,
      args: ['-e', 'process.stdout.write(JSON.stringify({ok:true}))'],
      cwd: process.cwd(),
      env: {},
      maxOutputBytes: 1024,
      timeoutMs: 1_000,
      signal: undefined,
    })).resolves.toEqual({ code: 0, stdout: '{"ok":true}', stderr: '' })
  })

  it('writes optional input only through child stdin', async () => {
    const execute = createNodeProcessExecutor()
    await expect(execute({
      executable: process.execPath,
      args: ['-e', 'process.stdin.pipe(process.stdout)'],
      cwd: process.cwd(), env: {}, maxOutputBytes: 1024, timeoutMs: 1_000,
      signal: undefined, input: 'stdin-secret',
    })).resolves.toEqual({ code: 0, stdout: 'stdin-secret', stderr: '' })
  })

  it('rejects output beyond the configured bound', async () => {
    const execute = createNodeProcessExecutor()
    await expect(execute({
      executable: process.execPath,
      args: ['-e', 'process.stdout.write("x".repeat(64))'],
      cwd: process.cwd(),
      env: {},
      maxOutputBytes: 16,
      timeoutMs: 1_000,
      signal: undefined,
    })).rejects.toThrow('output exceeded 16 bytes')
  })

  it('terminates a child process after its deadline', async () => {
    const execute = createNodeProcessExecutor()
    await expect(execute({
      executable: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      env: {},
      maxOutputBytes: 1024,
      timeoutMs: 20,
      signal: undefined,
    })).rejects.toThrow('timed out after 20ms')
  })
})
