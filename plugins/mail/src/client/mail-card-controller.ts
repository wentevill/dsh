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
  type SnapshotStore,
} from '@deepseek-ai/dsh-client-store'
import type {
  SettingsScope,
  SettingsScopeSnapshot,
} from '@deepseek-ai/dsh-client-ui-settings/client'
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

interface DraftEntry {
  text: string
  generation: number
  reset: boolean
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
): { store: SnapshotStore<MailCardState>; face: () => MailCardFace; refreshCredential: () => void; dispose: () => void } {
  const drafts = new Map<FlatField, DraftEntry>()
  const credential: CredentialView = { configured: false, writable: true }
  let saving = false
  let failed = false
  let mutationGeneration = 0
  let credentialReadGeneration = 0
  let saveGeneration = 0
  let disposed = false
  let activeSettingsBaseline: Map<FlatField, string> | undefined

  const confirmedValueOf = (snap: SettingsScopeSnapshot<MailSettings>, field: FlatField): string => {
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

  const valueOf = (snap: SettingsScopeSnapshot<MailSettings>, field: FlatField): string => {
    const d = drafts.get(field)
    return d?.text ?? confirmedValueOf(snap, field)
  }

  const fieldState = (snap: SettingsScopeSnapshot<MailSettings>, field: FlatField): CardFieldState => {
    const staged = drafts.get(field)
    if (staged !== undefined) {
      const invalid = PORT_FIELDS.has(field) ? !isValidPort(staged.text) : false
      const w = staged.text.trim()
      const sets = BOOLEAN_FIELDS.has(field) ? (w === 'true' || w === 'false') : (w !== '' && !invalid)
      return { text: staged.text, overridden: sets, invalid }
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
    [...PORT_FIELDS].some(field => drafts.has(field) && !isValidPort(drafts.get(field)?.text ?? ''))

  const retireSatisfiedResets = (): void => {
    if (saving) return
    const snap = scope.getSnapshot()
    for (const [field, draft] of drafts) {
      if (draft.reset && confirmedValueOf(snap, field) === draft.text) drafts.delete(field)
    }
  }

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
      password: { text: drafts.get('password' as FlatField)?.text ?? '', overridden: false, invalid: false },
      passwordConfigured: credential.configured,
      passwordWritable: credential.writable,
    }
  }

  const store = createSnapshotStore<MailCardState>(project())
  const publish = (): void => {
    if (!disposed) store.set(project())
  }
  const unsubscribe = scope.subscribe(() => {
    if (disposed) return
    retireSatisfiedResets()
    publish()
  })

  async function readCredential(): Promise<void> {
    if (disposed) return
    const generation = ++credentialReadGeneration
    try {
      const response = await api.credentials.describe({ refs: [PASSWORD_REF] })
      if (disposed || generation !== credentialReadGeneration) return
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
    if (disposed || saving || hasInvalidPortDraft()) return
    const generation = ++saveGeneration
    const transactionActive = (): boolean => !disposed && generation === saveGeneration
    saving = true
    failed = false
    publish()
    const submittedDrafts = new Map(drafts)
    const submittedSettings = new Map([...submittedDrafts].filter(([field]) => field !== 'password'))
    let settingsLanded = true
    let credentialLanded = true
    if (submittedSettings.size > 0) try {
      const snap = scope.getSnapshot()
      activeSettingsBaseline = new Map(
        [...submittedSettings.keys()].map(field => [field, confirmedValueOf(snap, field)]),
      )
      const str = (field: FlatField, fallback: string): string => {
        const d = submittedDrafts.get(field)
        return d !== undefined ? d.text.trim() : fallback
      }
      const portNum = (field: FlatField): number => {
        const fallback = field === 'imapPort' ? 993 : 465
        const d = submittedDrafts.get(field)
        if (d !== undefined) {
          const text = d.text.trim()
          if (text === '') return fallback
          const n = Number(text)
          return Number.isInteger(n) && isValidPort(text) ? n : 0
        }
        const v = (field === 'imapPort' ? nested(snap, 'imap', 'port') : nested(snap, 'smtp', 'port'))
        return typeof v === 'number' && isValidPort(String(v)) ? v : fallback
      }
      const booleanOf = (field: FlatField): boolean => {
        const d = submittedDrafts.get(field)
        if (d !== undefined) return d.text === 'true'
        const v = field === 'allowDelete'
          ? scalar(snap, 'allowDelete')
          : field === 'imapSecure' ? nested(snap, 'imap', 'secure') : nested(snap, 'smtp', 'secure')
        return v === true
      }
      const hostOf = (field: FlatField): string => {
        const d = submittedDrafts.get(field)
        if (d !== undefined) return d.text.trim()
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
      if (!transactionActive()) return
      for (const [field, submitted] of submittedSettings) {
        if (drafts.get(field)?.generation === submitted.generation) drafts.delete(field)
      }
    } catch {
      if (!transactionActive()) return
      settingsLanded = false
    }
    if (settingsLanded) {
      const passwordDraft = submittedDrafts.get('password')
      const pw = passwordDraft?.text.trim()
      if (pw) try {
        const response = await api.credentials.set({ ref: PASSWORD_REF, value: pw })
        if (!transactionActive()) return
        const result = response as unknown as { ok?: boolean; result?: { ok?: boolean } }
        if (result.ok === false || result.result?.ok === false) throw new Error('credential write was rejected')
        if (drafts.get('password')?.generation === passwordDraft?.generation) drafts.delete('password')
        await readCredential()
        if (!transactionActive()) return
      } catch {
        if (!transactionActive()) return
        credentialLanded = false
      }
    }
    if (!transactionActive()) return
    saving = false
    retireSatisfiedResets()
    activeSettingsBaseline = undefined
    failed = !settingsLanded || !credentialLanded
    publish()
  }

  const actions: CardActions = {
    edit: (field, text) => {
      if (disposed || !isFlat(field)) return
      const flat = field as FlatField
      mutationGeneration += 1
      if (flat === 'password' && text.trim() === '') drafts.delete(flat)
      else drafts.set(flat, { text, generation: mutationGeneration, reset: false })
      failed = false
      publish()
    },
    resetField: (field) => {
      if (disposed || !isFlat(field)) return
      const flat = field as FlatField
      if (saving && flat !== 'password') {
        drafts.set(flat, {
          text: activeSettingsBaseline?.get(flat) ?? confirmedValueOf(scope.getSnapshot(), flat),
          generation: ++mutationGeneration,
          reset: true,
        })
      } else {
        mutationGeneration += 1
        drafts.delete(flat)
      }
      failed = false
      publish()
    },
    save: () => { void save() },
    discard: () => {
      if (disposed) return
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

  const refreshCredential = (): void => {
    if (!disposed) void readCredential()
  }
  const dispose = (): void => {
    if (disposed) return
    disposed = true
    saveGeneration += 1
    credentialReadGeneration += 1
    activeSettingsBaseline = undefined
    saving = false
    failed = false
    drafts.clear()
    store.set(project())
    unsubscribe()
  }

  void readCredential()
  return { store, face, refreshCredential, dispose }
}

export { MAIL_NS as MAIL_SETTINGS_NAMESPACE }
export type { MailSettings }
