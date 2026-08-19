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
      const listeners = new Set<() => void>()
      return {
        getSnapshot: () => value,
        set: (next: unknown) => {
          value = next
          for (const listener of [...listeners]) listener()
        },
        subscribe: (listener: () => void) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
      }
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
  return exports as { createMailCardController: (scope: unknown, api: unknown, saveSettings: (settings: Record<string, unknown>) => Promise<{ settings: Record<string, unknown> }>, available: boolean) => {
    face(): { hooks: { mailCard: { getSnapshot(): { dirty: boolean; saving: boolean; failed: boolean; status: { receive: boolean; send: boolean; permanentDelete: boolean }; smtpHost: { text: string }; password: { text: string }; passwordConfigured: boolean; passwordWritable: boolean }; subscribe(listener: () => void): () => void } }; edit(field: string, value: string): void; resetField(field: string): void; save(): void }
    refreshCredential(): void
    dispose(): void
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
      username: 'user@example.com', mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: false,
      imap: { host: 'imap.example.com', port: 993, secure: true },
      smtp: { host: 'smtp.example.com', port: 465, secure: true },
    },
  }
}

describe('mail settings save', () => {
  it('projects receive, send, and permanent-delete status independently', async () => {
    const { createMailCardController } = await loadController()
    const snapshot: Snapshot = {
      writable: true,
      value: {
        username: 'user@example.com', mailbox: 'INBOX', archiveMailbox: 'Archive', allowDelete: true,
        imap: { host: 'imap.test', port: 993, secure: true },
        smtp: { host: '', port: 465, secure: true },
      },
    }
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
      async settings => ({ settings }),
      true,
    )
    const face = controller.face()

    expect(face.hooks.mailCard.getSnapshot().status).toEqual({ receive: true, send: false, permanentDelete: true })
    face.edit('imapHost', '')
    face.edit('smtpHost', 'smtp.test')
    expect(face.hooks.mailCard.getSnapshot().status).toEqual({ receive: false, send: true, permanentDelete: false })
  })

  it('saves the complete mail section through the mail-owned Host boundary', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const scope = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
    }
    const writes: Array<Record<string, unknown>> = []
    const saveSettings = async (settings: Record<string, unknown>) => {
      writes.push(settings)
      return { settings }
    }
    const controller = createMailCardController(scope, { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } }, saveSettings, true)
    const face = controller.face()
    face.edit('smtpHost', 'smtp.changed.example.com')
    face.save()
    await settle(face.hooks.mailCard)

    expect(writes).toEqual([{
      username: 'user@example.com',
      passwordEnv: 'MAIL_APP_PASSWORD',
      mailbox: 'INBOX',
      archiveMailbox: 'Archive',
      allowDelete: false,
      imap: { host: 'imap.example.com', port: 993, secure: true },
      smtp: { host: 'smtp.changed.example.com', port: 465, secure: true },
    }])
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, failed: false })
  })

  it('keeps drafts when the Host does not confirm the write in the user layer', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const scope = { getSnapshot: () => snapshot, subscribe: () => () => undefined }
    const saveSettings = async () => { throw new Error('Host rejected mail settings') }
    const controller = createMailCardController(scope, { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } }, saveSettings, true)
    const face = controller.face()
    face.edit('smtpHost', 'rejected.example.com')
    face.save()
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, failed: true })
  })

  it('does not retry a failed Host commit behind the user\'s back', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let attempts = 0
    const scope = { getSnapshot: () => snapshot, subscribe: () => () => undefined }
    const saveSettings = async () => { attempts += 1; throw new Error('revision conflict') }
    const controller = createMailCardController(scope, { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } }, saveSettings, true)
    const face = controller.face()
    face.edit('smtpHost', 'smtp.recovered.example.com')
    face.save()
    await settle(face.hooks.mailCard)

    expect(attempts).toBe(1)
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, failed: true })
  })

  it.each([
    ['a rejected credential result', async () => ({ result: { ok: false } })],
    ['a thrown credential error', async () => { throw new Error('credential unavailable') }],
  ])('keeps the password draft after %s', async (_name, set) => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }), set } },
      async settings => ({ settings }), true,
    )
    const face = controller.face()
    face.edit('password', 'not-a-secret-assertion')
    face.save()
    await settle(face.hooks.mailCard)
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, failed: true, password: { text: 'not-a-secret-assertion' } })
  })

  it('preserves an edit made while an earlier settings save is pending', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let resolveSave: ((value: { settings: Record<string, unknown> }) => void) | undefined
    const sent: Array<Record<string, unknown>> = []
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
      async settings => { sent.push(settings); return await new Promise(resolve => { resolveSave = resolve }) }, true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'first.example.com')
    face.save()
    face.edit('smtpHost', 'second.example.com')
    resolveSave?.({ settings: sent[0] as Record<string, unknown> })
    await settle(face.hooks.mailCard)
    expect(sent[0]).toMatchObject({ smtp: { host: 'first.example.com' } })
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, failed: false, smtpHost: { text: 'second.example.com' } })
  })

  it('preserves a same-value edit made while its save is pending', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let resolveSave: ((value: { settings: Record<string, unknown> }) => void) | undefined
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
      async settings => await new Promise(resolve => { resolveSave = resolve }), true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'same.example.com')
    face.save()
    face.edit('smtpHost', 'same.example.com')
    resolveSave?.({ settings: snapshot.value as Record<string, unknown> })
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, smtpHost: { text: 'same.example.com' } })
  })

  it('keeps a reset made during save when the confirmed server value changes', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let resolveSave: ((value: { settings: Record<string, unknown> }) => void) | undefined
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
      async settings => await new Promise(resolve => { resolveSave = resolve }), true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'landed.example.com')
    face.save()
    face.resetField('smtpHost')
    snapshot.value = { ...snapshot.value, smtp: { host: 'landed.example.com', port: 465, secure: true } }
    resolveSave?.({ settings: snapshot.value as Record<string, unknown> })
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, smtpHost: { text: 'smtp.example.com' } })
  })

  it('resets a submitted field to its pre-submit baseline after Remote advances the mirror', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let resolveCredential: ((value: unknown) => void) | undefined
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: {
        describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
        set: async () => await new Promise(resolve => { resolveCredential = resolve }),
      } },
      async settings => { snapshot.value = settings; return { settings } }, true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'landed.example.com')
    face.edit('password', 'credential-write-keeps-transaction-open')
    face.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(snapshot.value).toMatchObject({ smtp: { host: 'landed.example.com' } })

    face.resetField('smtpHost')
    resolveCredential?.({ result: { ok: true } })
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, smtpHost: { text: 'smtp.example.com' } })
  })

  it('resets a non-submitted concurrent edit to the current confirmed value', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let resolveSave: ((value: { settings: Record<string, unknown> }) => void) | undefined
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
      async settings => await new Promise(resolve => { resolveSave = resolve }), true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'submitted.example.com')
    face.save()
    face.edit('imapHost', 'concurrent.example.com')
    face.resetField('imapHost')
    resolveSave?.({ settings: snapshot.value as Record<string, unknown> })
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false })
  })

  it('retires a reset made during a failed save when the server still equals its baseline', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let rejectSave: ((reason?: unknown) => void) | undefined
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
      async () => await new Promise((_resolve, reject) => { rejectSave = reject }), true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'rejected.example.com')
    face.save()
    face.resetField('smtpHost')
    rejectSave?.(new Error('rejected'))
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, failed: true, smtpHost: { text: 'smtp.example.com' } })
  })

  it('makes a normal reset clean when the confirmed value already matches', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => ({ result: { ok: true, value: { credentials: {} } } }) } },
      async settings => ({ settings }), true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'temporary.example.com')
    face.resetField('smtpHost')

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, smtpHost: { text: 'smtp.example.com' } })
  })

  it('retires settings after a credential failure and retries only the password', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let settingWrites = 0
    let credentialWrites = 0
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: {
        describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
        set: async () => { credentialWrites += 1; return credentialWrites === 1 ? { result: { ok: false } } : { result: { ok: true } } },
      } },
      async settings => { settingWrites += 1; snapshot.value = settings; return { settings } }, true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'saved.example.com')
    face.edit('password', 'retry-me')
    face.save()
    await settle(face.hooks.mailCard)
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, failed: true, smtpHost: { text: 'saved.example.com' }, password: { text: 'retry-me' } })

    face.save()
    await settle(face.hooks.mailCard)
    expect({ settingWrites, credentialWrites }).toEqual({ settingWrites: 1, credentialWrites: 2 })
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, failed: false })
  })

  it('does not write the credential when the settings stage fails', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let credentialWrites = 0
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: {
        describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
        set: async () => { credentialWrites += 1; return { result: { ok: true } } },
      } },
      async () => { throw new Error('settings rejected') }, true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'rejected.example.com')
    face.edit('password', 'must-not-write')
    face.save()
    await settle(face.hooks.mailCard)

    expect(credentialWrites).toBe(0)
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: true, failed: true })
  })

  it('applies only the latest credential describe and ignores results after disposal', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const resolvers: Array<(value: unknown) => void> = []
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: { describe: async () => await new Promise(resolve => { resolvers.push(resolve) }) } },
      async settings => ({ settings }), true,
    )
    const face = controller.face()
    controller.refreshCredential()
    resolvers[1]?.({ result: { ok: true, value: { credentials: { MAIL_APP_PASSWORD: { configured: true, writable: false } } } } })
    await new Promise(resolve => setTimeout(resolve, 0))
    resolvers[0]?.({ result: { ok: true, value: { credentials: { MAIL_APP_PASSWORD: { configured: false, writable: true } } } } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ passwordConfigured: true, passwordWritable: false })

    controller.refreshCredential()
    controller.dispose()
    resolvers[2]?.({ result: { ok: true, value: { credentials: { MAIL_APP_PASSWORD: { configured: false, writable: true } } } } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ passwordConfigured: true, passwordWritable: false })
  })

  it('does not let initial or invalidation reads overwrite the post-write credential state', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const describeResolvers: Array<(value: unknown) => void> = []
    let resolveSet: ((value: unknown) => void) | undefined
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: {
        describe: async () => await new Promise(resolve => { describeResolvers.push(resolve) }),
        set: async () => await new Promise(resolve => { resolveSet = resolve }),
      } },
      async settings => ({ settings }), true,
    )
    const face = controller.face()
    controller.refreshCredential()
    face.edit('password', 'new-password')
    face.save()
    resolveSet?.({ result: { ok: true } })
    await new Promise(resolve => setTimeout(resolve, 0))
    describeResolvers[2]?.({ result: { ok: true, value: { credentials: { MAIL_APP_PASSWORD: { configured: true, writable: true } } } } })
    await new Promise(resolve => setTimeout(resolve, 0))
    describeResolvers[0]?.({ result: { ok: true, value: { credentials: { MAIL_APP_PASSWORD: { configured: false, writable: false } } } } })
    describeResolvers[1]?.({ result: { ok: true, value: { credentials: { MAIL_APP_PASSWORD: { configured: false, writable: false } } } } })
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, failed: false, passwordConfigured: true, passwordWritable: true })
  })

  it('normalizes a blank password edit to no draft', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let credentialWrites = 0
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: {
        describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
        set: async () => { credentialWrites += 1; return { result: { ok: true } } },
      } },
      async settings => ({ settings }), true,
    )
    const face = controller.face()
    face.edit('password', 'temporary')
    face.edit('password', '   ')
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, password: { text: '' } })
    face.save()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(credentialWrites).toBe(0)
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, failed: false })
  })

  it('keeps a cleared newer password edit clean when an older write lands', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let resolveSet: ((value: unknown) => void) | undefined
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: {
        describe: async () => ({ result: { ok: true, value: { credentials: { MAIL_APP_PASSWORD: { configured: true, writable: true } } } } }),
        set: async () => await new Promise(resolve => { resolveSet = resolve }),
      } },
      async settings => ({ settings }), true,
    )
    const face = controller.face()
    face.edit('password', 'older-write')
    face.save()
    face.edit('password', '')
    resolveSet?.({ result: { ok: true } })
    await settle(face.hooks.mailCard)

    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, failed: false, password: { text: '' }, passwordConfigured: true })
  })

  it('releases the staged baseline and ignores completion when disposed during credential set', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let resolveSet: ((value: unknown) => void) | undefined
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: {
        describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
        set: async () => await new Promise(resolve => { resolveSet = resolve }),
      } },
      async settings => { snapshot.value = settings; return { settings } }, true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'landed-before-dispose.example.com')
    face.edit('password', 'pending-write')
    face.save()
    await new Promise(resolve => setTimeout(resolve, 0))

    controller.dispose()
    controller.dispose()
    const disposedState = face.hooks.mailCard.getSnapshot()
    face.resetField('smtpHost')
    face.edit('smtpHost', 'must-be-ignored.example.com')
    resolveSet?.({ result: { ok: true } })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(disposedState).toMatchObject({ saving: false, smtpHost: { text: 'landed-before-dispose.example.com' } })
    expect(face.hooks.mailCard.getSnapshot()).toEqual(disposedState)
  })

  it('ignores a post-write credential describe that settles after disposal', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    const describeResolvers: Array<(value: unknown) => void> = []
    const controller = createMailCardController(
      { getSnapshot: () => snapshot, subscribe: () => () => undefined },
      { credentials: {
        describe: async () => await new Promise(resolve => { describeResolvers.push(resolve) }),
        set: async () => ({ result: { ok: true } }),
      } },
      async settings => { snapshot.value = settings; return { settings } }, true,
    )
    const face = controller.face()
    face.edit('smtpHost', 'described-after-dispose.example.com')
    face.edit('password', 'written')
    face.save()
    await new Promise(resolve => setTimeout(resolve, 0))
    controller.dispose()
    const disposedState = face.hooks.mailCard.getSnapshot()
    describeResolvers.at(-1)?.({ result: { ok: true, value: { credentials: { MAIL_APP_PASSWORD: { configured: true, writable: false } } } } })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(disposedState).toMatchObject({ saving: false, passwordConfigured: false, passwordWritable: true })
    expect(face.hooks.mailCard.getSnapshot()).toEqual(disposedState)
  })

  it('closes disposal before synchronously notifying terminal-store subscribers', async () => {
    const { createMailCardController } = await loadController()
    const snapshot = baseSnapshot()
    let remoteWrites = 0
    let credentialWrites = 0
    let scopeUnsubscribes = 0
    const controller = createMailCardController(
      {
        getSnapshot: () => snapshot,
        subscribe: () => () => { scopeUnsubscribes += 1 },
      },
      { credentials: {
        describe: async () => ({ result: { ok: true, value: { credentials: {} } } }),
        set: async () => { credentialWrites += 1; return { result: { ok: true } } },
      } },
      async settings => { remoteWrites += 1; return { settings } }, true,
    )
    const face = controller.face()
    let notifications = 0
    face.hooks.mailCard.subscribe(() => {
      notifications += 1
      face.edit('password', 'must-not-resurrect')
      face.resetField('smtpHost')
      face.save()
      controller.dispose()
    })

    controller.dispose()
    controller.dispose()
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(notifications).toBe(1)
    expect(scopeUnsubscribes).toBe(1)
    expect({ remoteWrites, credentialWrites }).toEqual({ remoteWrites: 0, credentialWrites: 0 })
    expect(face.hooks.mailCard.getSnapshot()).toMatchObject({ dirty: false, saving: false, failed: false, password: { text: '' } })
  })
})
