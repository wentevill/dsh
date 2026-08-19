import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

type Snapshot = {
  value?: Record<string, unknown>
  user?: Record<string, unknown>
  writable: boolean
}

type MailCardFace = {
  hooks: { mailCard: { getSnapshot(): { status: { receive: boolean; send: boolean; permanentDelete: boolean }; invalid: boolean; saving: boolean } } }
  edit(field: string, value: string): void
  save(): void
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
        : name === '@deepseek-ai/cordis'
          ? { Service: class {} }
          : {})
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = { __ModuleLoader__: loader }
  Function(readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8'))()
  return exports as { createMailCardController: (scope: unknown, api: unknown, saveSettings: (settings: Record<string, unknown>) => Promise<{ settings: Record<string, unknown> }>, available: boolean) => { face(): MailCardFace } }
}

afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window })

async function settle(face: MailCardFace): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise(resolveWait => setTimeout(resolveWait, 0))
    if (!face.hooks.mailCard.getSnapshot().saving) return
  }
  throw new Error('mail save did not settle')
}

function controllerFor(snapshot: Snapshot, saveSettings: (settings: Record<string, unknown>) => Promise<{ settings: Record<string, unknown> }>) {
  return loadController().then(({ createMailCardController }) => createMailCardController(
    { getSnapshot: () => snapshot, subscribe: () => () => undefined },
    { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
    saveSettings,
    true,
  ))
}

describe('mail capability card status', () => {
  it('derives receive, send, and permanent-delete independently from current settings and drafts', async () => {
    const controller = await controllerFor({
      writable: true,
      value: {
        username: 'user@example.com', mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: false,
        imap: { host: '', port: 993, secure: true },
        smtp: { host: '', port: 465, secure: true },
      },
    }, async settings => ({ settings }))
    const face = controller.face()

    expect(face.hooks.mailCard.getSnapshot().status).toEqual({ receive: false, send: false, permanentDelete: false })
    face.edit('imapHost', 'imap.example.com')
    expect(face.hooks.mailCard.getSnapshot().status).toEqual({ receive: true, send: false, permanentDelete: false })
    face.edit('allowDelete', 'true')
    expect(face.hooks.mailCard.getSnapshot().status).toEqual({ receive: true, send: false, permanentDelete: true })
    face.edit('smtpHost', 'smtp.example.com')
    expect(face.hooks.mailCard.getSnapshot().status).toEqual({ receive: true, send: true, permanentDelete: true })
    face.edit('imapHost', '')
    expect(face.hooks.mailCard.getSnapshot().status).toEqual({ receive: false, send: true, permanentDelete: false })
  })

  it('saves a complete projection without dropping current fields and with endpoint defaults', async () => {
    const writes: Array<Record<string, unknown>> = []
    const controller = await controllerFor({
      writable: true,
      value: {
        username: 'account@example.com', passwordEnv: 'MAIL_APP_PASSWORD', mailbox: 'Receipts', archiveMailbox: 'Processed', allowDelete: true,
        imap: { host: '', secure: true },
        smtp: { host: 'smtp.example.com', secure: true },
      },
    }, async settings => { writes.push(settings); return { settings } })
    const face = controller.face()

    face.edit('smtpHost', 'smtp.changed.example.com')
    face.save()
    await settle(face)

    expect(writes).toEqual([{
      username: 'account@example.com', passwordEnv: 'MAIL_APP_PASSWORD', mailbox: 'Receipts', archiveMailbox: 'Processed', allowDelete: true,
      imap: { host: '', port: 993, secure: true },
      smtp: { host: 'smtp.changed.example.com', port: 465, secure: true },
    }])
  })

  it('saves blank port drafts as their endpoint defaults', async () => {
    const writes: Array<Record<string, unknown>> = []
    const controller = await controllerFor({
      writable: true,
      value: {
        username: 'user@example.com', mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: false,
        imap: { host: 'imap.example.com', port: 143, secure: true },
        smtp: { host: 'smtp.example.com', port: 587, secure: true },
      },
    }, async settings => { writes.push(settings); return { settings } })
    const face = controller.face()

    face.edit('imapPort', '')
    face.edit('smtpPort', '')
    expect(face.hooks.mailCard.getSnapshot().invalid).toBe(false)
    face.save()
    await settle(face)

    expect(writes).toEqual([expect.objectContaining({
      imap: expect.objectContaining({ port: 993 }),
      smtp: expect.objectContaining({ port: 465 }),
    })])
  })

  it('does not send a save with an invalid endpoint port', async () => {
    const writes: Array<Record<string, unknown>> = []
    const controller = await controllerFor({
      writable: true,
      value: {
        username: 'user@example.com', mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: false,
        imap: { host: 'imap.example.com', port: 993, secure: true },
        smtp: { host: '', port: 465, secure: true },
      },
    }, async settings => { writes.push(settings); return { settings } })
    const face = controller.face()

    face.edit('imapPort', '65536')
    expect(face.hooks.mailCard.getSnapshot().invalid).toBe(true)
    face.save()
    await new Promise(resolveWait => setTimeout(resolveWait, 0))

    expect(writes).toEqual([])
  })
})
