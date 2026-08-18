import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { en, zh } from '../src/client/locales.ts'

const field = { text: '', overridden: false, invalid: false }

async function loadCard() {
  let exports: Record<string, unknown> | undefined
  const loader = {
    load({ factory }: { factory: (require: (name: string) => unknown) => Record<string, unknown> }) {
      exports = factory(name => name === 'react'
        ? { useState: () => [false, () => undefined] }
        : name === 'react/jsx-runtime'
          ? { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) }
          : name === '@deepseek-ai/dsh-client-ui-primitives'
            ? { IconChevronDownOutline14: () => undefined }
            : name === '@deepseek-ai/cordis'
              ? { Service: class {} }
              : {})
    },
  }
  ;(globalThis as unknown as { window: unknown }).window = { __ModuleLoader__: loader }
  Function(readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8'))()
  return exports as { MailCard: (props: unknown) => unknown }
}

afterEach(() => { delete (globalThis as unknown as { window?: unknown }).window })

async function renderedStatus(copy: typeof en) {
  const { MailCard } = await loadCard()
  const state = {
    available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false,
    capabilities: { imap: true, smtp: false, delete: true },
    status: { receive: true, send: false, permanentDelete: true },
    username: field, mailbox: field, archiveMailbox: field, allowDelete: field,
    imapHost: field, imapPort: field, imapSecure: field,
    smtpHost: field, smtpPort: field, smtpSecure: field,
    password: field, passwordConfigured: false, passwordWritable: true,
  }
  const card = MailCard({
    t: key => copy[key as keyof typeof copy],
    useMailCard: selector => selector(state),
    edit: () => undefined, resetField: () => undefined, save: () => undefined, discard: () => undefined,
  } as never) as { props: { children: Array<{ props: { children: Array<{ props: { children: string[] } }> } }> } }

  return card.props.children[0].props.children.map(line => line.props.children.join(''))
}

describe('mail card capability status rendering', () => {
  it('renders the enabled and disabled receive/send/delete labels in English', async () => {
    await expect(renderedStatus(en)).resolves.toEqual([
      'Receive: Enabled',
      'Send: Disabled',
      'Permanent delete: Enabled',
    ])
  })

  it('renders the enabled and disabled receive/send/delete labels in Chinese', async () => {
    await expect(renderedStatus(zh)).resolves.toEqual([
      '接收: 已启用',
      '发送: 已禁用',
      '永久删除: 已启用',
    ])
  })
})
