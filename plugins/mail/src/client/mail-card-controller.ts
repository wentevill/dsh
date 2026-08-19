/**
 * Mail card controller over the nested `mail` settings scope, shaped to drive
 * the shared plugin-card chrome (PluginCard + ValueField + SecretField).
 *
 * The namespace section is nested (`imap.{host,port,secure}`, `smtp.{…}`);
 * this controller stages flat drafts and, on save, writes them back into the
 * nested section through the client scope's single-key `set` (whole-group
 * writes for `imap`/`smtp`). The password is the one control that never rides
 * a response: it is written through the credentials domain under the fixed
 * `MAIL_APP_PASSWORD` reference.
 */

import {
  createSnapshotStore,
  type SettingsScope,
  type SettingsScopeSnapshot,
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-runtime/client'
import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { mailCapabilities, type MailCapabilities, type MailSettings } from '../mail-settings.ts'
import type { MailSettingsSaveResult } from '../remote-types.ts'
import type { CardActions, CardFieldState, CardShell } from './card-types.ts'

/** The section namespace key this card edits. */
const MAIL_NS = 'mail' as const

/** The credential reference the password always lives under. */
const PASSWORD_REF = 'MAIL_APP_PASSWORD'

/** Flat control names the card chrome edits; nested fields map onto the section. */
type FlatField =
  | 'username' | 'mailbox' | 'archiveMailbox' | 'allowDelete'
  | 'imapHost' | 'imapPort' | 'imapSecure'
  | 'smtpHost' | 'smtpPort' | 'smtpSecure'
  | 'password'

/** What the credentials domain last reported for the password reference. */
interface CredentialView {
  configured: boolean
  writable: boolean
}

/** User-facing operation availability projected from the Mail capability predicate. */
export interface MailCardStatus {
  receive: boolean
  send: boolean
  permanentDelete: boolean
}

/** The card's renderable state. */
export interface MailCardState extends CardShell {
  capabilities: MailCapabilities
  status: MailCardStatus
  username: CardFieldState
  mailbox: CardFieldState
  archiveMailbox: CardFieldState
  allowDelete: CardFieldState
  imapHost: CardFieldState
  imapPort: CardFieldState
  imapSecure: CardFieldState
  smtpHost: CardFieldState
  smtpPort: CardFieldState
  smtpSecure: CardFieldState
  password: CardFieldState
  passwordConfigured: boolean
  passwordWritable: boolean
}

/** The registration-side face the card's slot entry injects. */
export interface MailCardFace extends CardActions {
  hooks: {
    mailCard: SnapshotStore<MailCardState>
  }
}

function scalar(snap: SettingsScopeSnapshot<MailSettings>, key: string): unknown {
  return (snap.value as Record<string, unknown> | undefined)?.[key]
}
function nested(snap: SettingsScopeSnapshot<MailSettings>, group: 'imap' | 'smtp', key: string): unknown {
  const g = (snap.value as Record<string, unknown> | undefined)?.[group]
  return (g as Record<string, unknown> | undefined)?.[key]
}
function storedScalar(snap: SettingsScopeSnapshot<MailSettings>, key: string): boolean {
  const user = snap.user as Record<string, unknown> | undefined
  return user !== undefined && Object.prototype.hasOwnProperty.call(user, key)
}
function storedGroup(snap: SettingsScopeSnapshot<MailSettings>, group: string): boolean {
  const user = snap.user as Record<string, unknown> | undefined
  return user !== undefined && user[group] !== undefined
}

function isValidPort(text: string): boolean {
  if (text.trim() === '') return true
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 && n <= 65535
}

const TEXT_FIELDS: ReadonlySet<FlatField> = new Set(['username', 'mailbox', 'archiveMailbox', 'imapHost', 'smtpHost'])
const PORT_FIELDS: ReadonlySet<FlatField> = new Set(['imapPort', 'smtpPort'])
const BOOLEAN_FIELDS: ReadonlySet<FlatField> = new Set(['imapSecure', 'smtpSecure', 'allowDelete'])

const isFlat = (field: string): boolean =>
  field === 'password' || TEXT_FIELDS.has(field as FlatField) || PORT_FIELDS.has(field as FlatField) || BOOLEAN_FIELDS.has(field as FlatField)

/**
 * Build the mail card controller.
 * @param scope - the bound settings scope for the `mail` namespace.
 * @param api - wire face used for the password credential.
 * @param available - true once the namespace is served to this client.
 * @returns the snapshot store, injected face, and a credential invalidation hook.
 */
export function createMailCardController(
  scope: Pick<SettingsScope<MailSettings>, 'getSnapshot' | 'subscribe'>,
  api: Pick<IApiClient, 'credentials'>,
  saveSettings: (settings: MailSettings) => Promise<MailSettingsSaveResult>,
  available: boolean,
): { store: SnapshotStore<MailCardState>; face: () => MailCardFace; refreshCredential: () => void } {
  const drafts = new Map<FlatField, string>()
  const credential: CredentialView = { configured: false, writable: true }
  let saving = false
  let failed = false

  const valueOf = (snap: SettingsScopeSnapshot<MailSettings>, field: FlatField): string => {
    const d = drafts.get(field)
    if (d !== undefined) return d
    const raw = field === 'imapHost' ? nested(snap, 'imap', 'host')
      : field === 'imapPort' ? nested(snap, 'imap', 'port')
      : field === 'imapSecure' ? nested(snap, 'imap', 'secure')
      : field === 'smtpHost' ? nested(snap, 'smtp', 'host')
      : field === 'smtpPort' ? nested(snap, 'smtp', 'port')
      : field === 'smtpSecure' ? nested(snap, 'smtp', 'secure')
      : scalar(snap, field)
    if (PORT_FIELDS.has(field)) return typeof raw === 'number' ? String(raw) : ''
    if (BOOLEAN_FIELDS.has(field)) return raw === true ? 'true' : 'false'
    return typeof raw === 'string' ? raw : ''
  }

  const fieldState = (snap: SettingsScopeSnapshot<MailSettings>, field: FlatField): CardFieldState => {
    const staged = drafts.get(field)
    if (staged !== undefined) {
      const invalid = PORT_FIELDS.has(field) ? !isValidPort(staged) : false
      const w = staged.trim()
      const sets = BOOLEAN_FIELDS.has(field) ? (w === 'true' || w === 'false') : (w !== '' && !invalid)
      return { text: staged, overridden: sets, invalid }
    }
    const stored = field === 'allowDelete'
      ? storedScalar(snap, field)
      : BOOLEAN_FIELDS.has(field)
      ? storedGroup(snap, field === 'imapSecure' ? 'imap' : 'smtp')
      : (field === 'imapHost' || field === 'imapPort') ? storedGroup(snap, 'imap')
      : (field === 'smtpHost' || field === 'smtpPort') ? storedGroup(snap, 'smtp')
      : storedScalar(snap, field)
    return { text: valueOf(snap, field), overridden: stored, invalid: false }
  }

  const hasInvalidPortDraft = (): boolean =>
    [...PORT_FIELDS].some(field => drafts.has(field) && !isValidPort(drafts.get(field) as string))

  const project = (): MailCardState => {
    const snap = scope.getSnapshot()
    const planInvalid = hasInvalidPortDraft()
    const capabilities = mailCapabilities({
      username: '',
      passwordEnv: PASSWORD_REF,
      mailbox: 'INBOX',
      archiveMailbox: 'Archive',
      allowDelete: valueOf(snap, 'allowDelete') === 'true',
      imap: { host: valueOf(snap, 'imapHost'), port: 993, secure: valueOf(snap, 'imapSecure') === 'true' },
      smtp: { host: valueOf(snap, 'smtpHost'), port: 465, secure: valueOf(snap, 'smtpSecure') === 'true' },
    })
    const status: MailCardStatus = {
      receive: capabilities.imap,
      send: capabilities.smtp,
      permanentDelete: capabilities.delete,
    }
    return {
      available,
      writable: snap.writable,
      dirty: drafts.size > 0,
      invalid: planInvalid,
      saving,
      failed,
      capabilities,
      status,
      username: fieldState(snap, 'username'),
      mailbox: fieldState(snap, 'mailbox'),
      archiveMailbox: fieldState(snap, 'archiveMailbox'),
      allowDelete: fieldState(snap, 'allowDelete'),
      imapHost: fieldState(snap, 'imapHost'),
      imapPort: fieldState(snap, 'imapPort'),
      imapSecure: fieldState(snap, 'imapSecure'),
      smtpHost: fieldState(snap, 'smtpHost'),
      smtpPort: fieldState(snap, 'smtpPort'),
      smtpSecure: fieldState(snap, 'smtpSecure'),
      password: { text: drafts.get('password' as FlatField) ?? '', overridden: false, invalid: false },
      passwordConfigured: credential.configured,
      passwordWritable: credential.writable,
    }
  }

  const store = createSnapshotStore<MailCardState>(project())
  const publish = (): void => { store.set(project()) }
  scope.subscribe(publish)

  async function readCredential(): Promise<void> {
    try {
      const response = await api.credentials.describe({ refs: [PASSWORD_REF] })
      if (!response.result.ok) return
      const view = response.result.value.credentials[PASSWORD_REF]
      const next = { configured: view?.configured ?? false, writable: view?.writable ?? true }
      if (next.configured === credential.configured && next.writable === credential.writable) return
      credential.configured = next.configured
      credential.writable = next.writable
      publish()
    } catch { /* card stays usable */ }
  }

  async function save(): Promise<void> {
    if (saving || hasInvalidPortDraft()) return
    saving = true
    failed = false
    publish()
    let landed = true
    try {
      const snap = scope.getSnapshot()
      const str = (field: FlatField, fallback: string): string => {
        const d = drafts.get(field)
        return d !== undefined ? d.trim() : fallback
      }
      const portNum = (field: FlatField): number => {
        const fallback = field === 'imapPort' ? 993 : 465
        const d = drafts.get(field)
        if (d !== undefined) {
          const text = d.trim()
          if (text === '') return fallback
          const n = Number(text)
          return Number.isInteger(n) && isValidPort(text) ? n : 0
        }
        const v = (field === 'imapPort' ? nested(snap, 'imap', 'port') : nested(snap, 'smtp', 'port'))
        return typeof v === 'number' && isValidPort(String(v)) ? v : fallback
      }
      const booleanOf = (field: FlatField): boolean => {
        const d = drafts.get(field)
        if (d !== undefined) return d === 'true'
        const v = field === 'allowDelete'
          ? scalar(snap, 'allowDelete')
          : field === 'imapSecure' ? nested(snap, 'imap', 'secure') : nested(snap, 'smtp', 'secure')
        return v === true
      }
      const hostOf = (field: FlatField): string => {
        const d = drafts.get(field)
        if (d !== undefined) return d.trim()
        const v = (field === 'imapHost' ? nested(snap, 'imap', 'host') : nested(snap, 'smtp', 'host'))
        return typeof v === 'string' ? v : ''
      }

      await saveSettings({
        username: str('username', typeof scalar(snap, 'username') === 'string' ? scalar(snap, 'username') as string : ''),
        passwordEnv: typeof scalar(snap, 'passwordEnv') === 'string' ? scalar(snap, 'passwordEnv') as string : PASSWORD_REF,
        mailbox: str('mailbox', typeof scalar(snap, 'mailbox') === 'string' ? scalar(snap, 'mailbox') as string : 'INBOX') || 'INBOX',
        archiveMailbox: str('archiveMailbox', typeof scalar(snap, 'archiveMailbox') === 'string' ? scalar(snap, 'archiveMailbox') as string : 'Archive') || 'Archive',
        allowDelete: booleanOf('allowDelete'),
        imap: { host: hostOf('imapHost'), port: portNum('imapPort'), secure: booleanOf('imapSecure') },
        smtp: { host: hostOf('smtpHost'), port: portNum('smtpPort'), secure: booleanOf('smtpSecure') },
      })

      const pw = drafts.get('password' as FlatField)?.trim()
      if (pw) {
        try { await api.credentials.set({ ref: PASSWORD_REF, value: pw }) } catch { /* re-read below */ }
      }
      await readCredential()
    } catch { landed = false }
    if (landed) drafts.clear()
    saving = false
    failed = !landed
    publish()
  }

  const actions: CardActions = {
    edit: (field, text) => {
      if (!isFlat(field)) return
      drafts.set(field as FlatField, text)
      failed = false
      publish()
    },
    resetField: (field) => {
      if (!isFlat(field)) return
      drafts.delete(field as FlatField)
      failed = false
      publish()
    },
    save: () => { void save() },
    discard: () => {
      if (drafts.size === 0 && !failed) return
      drafts.clear()
      failed = false
      publish()
    },
  }

  const face = (): MailCardFace => ({
    hooks: { mailCard: store },
    ...actions,
  })

  const refreshCredential = (): void => { void readCredential() }

  void readCredential()
  return { store, face, refreshCredential }
}

export { MAIL_NS as MAIL_SETTINGS_NAMESPACE }
export type { MailSettings }
