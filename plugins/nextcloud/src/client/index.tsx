import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import React, { useState } from 'react'
import remote from '../../lib/typert.remote-client.js'
import type { NextcloudSettings } from '../settings.ts'
import { css, ensureCardCSS } from './card-css.ts'
import { en, zh, type LocaleKey } from './locales.ts'
import { NEXTCLOUD_CARD_SLOT_OPTIONS } from './slot-options.ts'

const NS = 'settings.plugins.nextcloud'
const NEXTCLOUD_PASSWORD_REF = 'NEXTCLOUD_APP_PASSWORD'

type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }
type CredentialRemote = { set(ref: string, value: string): Promise<RemoteResult<void>> }

function unwrap<T>(response: RemoteResult<T>): T {
  if (!response.ok) throw new Error(response.error.message)
  return response.value
}

export async function loadNextcloudCardSettings(remoteApi: { load(): Promise<any> }): Promise<NextcloudSettings> {
  return unwrap(await remoteApi.load()).settings
}

export async function storeNextcloudCredential(
  credentials: CredentialRemote,
  value: string,
): Promise<void> {
  unwrap(await credentials.set(NEXTCLOUD_PASSWORD_REF, value))
}

function Field(props: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return <div className={css.field}><label className={css.label} htmlFor={props.id}>{props.label}</label>{props.children}{props.hint ? <p className={css.hint}>{props.hint}</p> : null}</div>
}

function Card({ remoteApi, credentials, initialSettings, t }: { remoteApi: any; credentials: CredentialRemote; initialSettings: NextcloudSettings; t: (key: LocaleKey) => string }) {
  const [baseline, setBaseline] = useState(initialSettings)
  const [settings, setSettings] = useState(initialSettings)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'saved' | 'connected' | 'failed' | ''>('')
  const [open, setOpen] = useState(false)
  ensureCardCSS()
  const dirty = JSON.stringify(settings) !== JSON.stringify(baseline) || password.trim() !== ''
  const update = <K extends keyof NextcloudSettings>(key: K, value: NextcloudSettings[K]) => setSettings(current => ({ ...current, [key]: value }))
  const run = async (operation: () => Promise<void>, success: 'saved' | 'connected') => {
    setBusy(true); setStatus('')
    try { await operation(); setStatus(success) } catch { setStatus('failed') } finally { setBusy(false) }
  }
  const save = () => run(async () => {
    const saved = unwrap<any>(await remoteApi.save({ settings }))
    setSettings(saved.settings); setBaseline(saved.settings)
    if (password.trim() !== '') {
      await storeNextcloudCredential(credentials, password.trim())
      setPassword('')
    }
  }, 'saved')
  const cardClass = open ? `${css.card} ${css.cardOpen}` : css.card
  return <li className={cardClass}>
    <button type="button" className={css.header} aria-expanded={open} aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`} onClick={() => setOpen(value => !value)}>
      <span className={css.headText}><span className={css.name}>{t('title')}</span><span className={css.description}>{t('description')}</span></span>
      {dirty ? <span className={css.pending}>{t('unsaved')}</span> : null}<span aria-hidden="true" className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron}>⌄</span>
    </button>
    {open ? <div className={css.body}>
      <Field id="nextcloud-server" label={t('serverUrl')}><input id="nextcloud-server" className={css.input} value={settings.serverUrl} placeholder="https://cloud.example.com" onChange={e => update('serverUrl', e.target.value)} /></Field>
      <Field id="nextcloud-username" label={t('username')}><input id="nextcloud-username" className={css.input} value={settings.username} autoComplete="username" onChange={e => update('username', e.target.value)} /></Field>
      <Field id="nextcloud-password" label={t('password')}><input id="nextcloud-password" className={css.input} type="password" value={password} autoComplete="off" placeholder="••••••••" onChange={e => setPassword(e.target.value)} /></Field>
      <Field id="nextcloud-access" label={t('accessMode')}><select id="nextcloud-access" className={css.input} value={settings.accessMode} onChange={e => update('accessMode', e.target.value as 'all' | 'allowlist')}><option value="all">{t('all')}</option><option value="allowlist">{t('allowlist')}</option></select></Field>
      {settings.accessMode === 'allowlist' ? <Field id="nextcloud-roots" label={t('roots')}><textarea id="nextcloud-roots" className={css.input} rows={4} value={settings.allowedRoots.join('\n')} onChange={e => update('allowedRoots', e.target.value.split('\n').map(v => v.trim()).filter(Boolean))} /></Field> : null}
      {(['allowDelete', 'allowHttp', 'skipTlsVerify'] as const).map(key => <label key={key} className={css.check}><input className={css.checkbox} type="checkbox" checked={settings[key]} onChange={e => update(key, e.target.checked)} />{t(key)}</label>)}
      {status ? <p className={`${css.status} ${status === 'failed' ? css.failed : ''}`} role="status">{t(status)}</p> : null}
      <div className={css.footer}>
        <button type="button" className={css.secondary} disabled={busy} onClick={() => void run(async () => { unwrap(await remoteApi.testConnection()) }, 'connected')}>{t('test')}</button>
        <button type="button" className={css.secondary} disabled={busy || !dirty} onClick={() => { setSettings(baseline); setPassword(''); setStatus('') }}>{t('discard')}</button>
        <button type="button" className={css.primary} disabled={busy || !dirty} onClick={() => void save()}>{t('save')}</button>
      </div>
    </div> : null}
  </li>
}

export const name = 'nextcloud-client'
export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remote)
  const feature = ctx.plugin(Object.assign(async (child: ClientContext) => {
    child.effect(() => child.locale.register(NS, { zh, en }), 'nextcloud-client: dictionaries')
    const remoteApi = child.remote.nextcloudSettings
    const initialSettings = await loadNextcloudCardSettings(remoteApi)
    child.slots.inject('settings.plugin.item', function* () {
      yield child.slots.register(NEXTCLOUD_CARD_SLOT_OPTIONS, (props: { t: (key: LocaleKey) => string }) => <Card remoteApi={remoteApi} credentials={child.remote.credentials} initialSettings={initialSettings} t={props.t} />)
    })
  }, { inject: ['slots', 'locale', 'remote', 'remote.credentials', 'remote.nextcloudSettings'] }))
  await feature
  return async () => { await feature.dispose(); await disposeRemote() }
}

export { NEXTCLOUD_CARD_SLOT_OPTIONS }
