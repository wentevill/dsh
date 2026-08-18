import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

type Snapshot = {
  value?: Record<string, unknown>
  user?: Record<string, unknown>
  writable: boolean
}

async function loadController() {
  let exports: Record<string, unknown> | undefined
  const runtime = {
    createSnapshotStore(initial: unknown) {
      let value = initial
      return { getSnapshot: () => value, set: (next: unknown) => { value = next }, subscribe: () => () => undefined }
    },
  }
  const loader = {
    load({ factory }: { factory: (require: (name: string) => unknown) => Record<string, unknown> }) {
      exports = factory((name) => name === '@deepseek-ai/dsh-client-runtime/client'
        ? runtime
        : name === 'react'
          ? { useState: () => [false, () => undefined] }
          : name === 'react/jsx-runtime'
            ? { jsx: () => undefined, jsxs: () => undefined }
            : {})
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = { __ModuleLoader__: loader }
  Function(readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8'))()
  return exports as { createMailCardController: (scope: unknown, api: unknown, available: boolean) => {
    face(): { hooks: { mailCard: { getSnapshot(): { dirty: boolean; saving: boolean; failed: boolean } } }; edit(field: string, value: string): void; save(): void }
  } }
}

afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window })

async function settle(store: { getSnapshot(): { saving: boolean } }): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise(resolveWait => setTimeout(resolveWait, 0))
    if (!store.getSnapshot().saving) return
  }
  throw new Error('mail save did not settle')
}

function baseSnapshot(): Snapshot {
  return {
    writable: true,
    value: {
      username: 'user@example.com', mailbox: 'INBOX',
      imap: { host: 'imap.example.com', port: 993, secure: true },
      smtp: { host: 'smtp.example.com', port: 465, secure: true },
    },
  }
}

describe('mail settings save', () => {
  it('writes only the SMTP group when only SMTP was edited', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const writes: Array<[string, unknown]> = []
    const listeners = new Set<() => void>()
    const scope = {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
      async set(field: string, value: unknown) {
        writes.push([field, value])
        snapshot.user = { ...(snapshot.user ?? {}), [field]: value }
        snapshot.value = { ...(snapshot.value ?? {}), [field]: value }
        listeners.forEach(listener => listener())
      },
    }
    const controller = createMailCardController(scope, { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } }, true)
    const face = controller.face()
    face.edit('smtpHost', 'smtp.changed.example.com')
    face.save()
    await settle(face.hooks.mailCard)

    expect(writes).toEqual([['smtp', { host: 'smtp.changed.example.com', port: 465, secure: true }]])
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, failed: false })
  })

  it('keeps drafts when the Host does not confirm the write in the user layer', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const scope = { getSnapshot: () => snapshot, subscribe: () => () => undefined, set: async () => undefined }
    const controller = createMailCardController(scope, { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } }, true)
    const face = controller.face()
    face.edit('smtpHost', 'rejected.example.com')
    face.save()
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, failed: true })
  })
})
