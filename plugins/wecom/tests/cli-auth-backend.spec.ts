import { describe, expect, it } from 'vitest'
import { createCliAuthBackend } from '../src/cli-auth-backend.ts'
import type { ProcessInvocation, ProcessResult } from '../src/transport.ts'

describe('wecom-cli authorization backend', () => {
  it('checks authorization with the script-safe status flag', async () => {
    const calls: ProcessInvocation[] = []
    const backend = createCliAuthBackend({
      executable: '/plugin/wecom-cli', configDir: '/config', tempDir: '/tmp/wecom',
      execute: async invocation => { calls.push(invocation); return { code: 0, stdout: 'authorized\n', stderr: '' } },
      readQr: async () => new Uint8Array(),
      deleteOwned: async () => {},
    })
    await expect(backend.status()).resolves.toEqual({ authorized: true })
    expect(calls[0]?.args).toEqual(['auth', 'show', '--status'])
  })

  it('emits a generated QR before the authorization process exits', async () => {
    let finish: ((value: ProcessResult) => void) | undefined
    const qrStates: string[] = []
    const backend = createCliAuthBackend({
      executable: '/plugin/wecom-cli', configDir: '/config', tempDir: '/tmp/wecom',
      execute: invocation => {
        expect(invocation.args.slice(0, 5)).toEqual(['auth', 'init', '--noninteractive', '--no-browser', '--output-qrcode'])
        expect(invocation.args[5]).toMatch(/^qr-[\w-]+\.png$/u)
        return new Promise(resolve => { finish = resolve })
      },
      readQr: async path => {
        expect(path).toMatch(/^\/tmp\/wecom\/qr-[\w-]+\.png$/u)
        return new Uint8Array([113, 114])
      },
      deleteOwned: async () => {},
    })
    const pending = backend.connect({
      signal: new AbortController().signal,
      onQr: data => { qrStates.push(data); finish?.({ code: 0, stdout: '', stderr: '' }) },
    })
    await pending
    expect(qrStates).toEqual(['data:image/png;base64,cXI='])
  })

  it('reports a CLI exit that happens before QR creation', async () => {
    let qrWaitAborted = false
    const backend = createCliAuthBackend({
      executable: 'wecom-cli', configDir: '/config', tempDir: '/tmp/wecom',
      execute: async () => ({ code: 7, stdout: '', stderr: 'failed' }),
      readQr: (_path, signal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          qrWaitAborted = true
          reject(Object.assign(new Error('cancelled'), { name: 'AbortError' }))
        }, { once: true })
      }),
      deleteOwned: async () => {},
    })
    await expect(backend.connect({ signal: new AbortController().signal, onQr: () => {} }))
      .rejects.toThrow('before producing a QR (7)')
    expect(qrWaitAborted).toBe(true)
  })

  it('delegates deletion to the fixed owned-file operation', async () => {
    let deleted = 0
    const backend = createCliAuthBackend({
      executable: 'wecom-cli', configDir: '/config', tempDir: '/tmp/wecom',
      execute: async () => ({ code: 0, stdout: '', stderr: '' }),
      readQr: async () => new Uint8Array(),
      deleteOwned: async () => { deleted += 1 },
    })
    await backend.deleteOwnedAuthorization()
    expect(deleted).toBe(1)
  })
})
