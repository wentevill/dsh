import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import React, { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import remote from '../../lib/typert.remote-client.js'
import type { ConfluenceSettings } from '../settings.ts'
import { CONFLUENCE_CARD_SLOT_OPTIONS } from './slot-options.ts'
import { unwrapRemote } from './remote-result.ts'
import { css, ensureCardCSS } from './card-css.ts'
import { en, zh, type ConfluenceLocaleKey } from './locales.ts'

const EMPTY: ConfluenceSettings = { baseUrl: '', allowAllSpaces: false, allowedSpaceKeys: [] }

type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: { message: string } }
type CredentialRemote = { set(ref: string, value: string): Promise<RemoteResult<void>> }

export async function storeConfluenceCredential(
  credentials: CredentialRemote,
  ref: string,
  value: string,
): Promise<void> {
  unwrapRemote<void>(await credentials.set(ref, value))
}

function ConfluenceCard({ remoteApi, credentials, t }: { remoteApi: any; credentials: CredentialRemote; t: (key: ConfluenceLocaleKey) => string }) {
  const initialRemote = useRef(remoteApi)
  const [settings, setSettings] = useState(EMPTY)
  const [savedSettings, setSavedSettings] = useState(EMPTY)
  const [pat, setPat] = useState('')
  const [spaces, setSpaces] = useState('')
  const [status, setStatus] = useState<ConfluenceLocaleKey | string>('unconfigured')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  ensureCardCSS()
  useEffect(() => {
    void initialRemote.current.load().then((response: any) => {
      const value = unwrapRemote<{ settings: ConfluenceSettings }>(response)
      setSettings(value.settings)
      setSavedSettings(value.settings)
      setSpaces(value.settings.allowedSpaceKeys.join('\n'))
    }).catch((cause: unknown) => setStatus(cause instanceof Error ? cause.message : 'loadFailed'))
  }, [])
  const update = (patch: Partial<ConfluenceSettings>) => setSettings(current => ({ ...current, ...patch }))
  const pendingSettings = (): ConfluenceSettings => ({
    ...settings,
    allowedSpaceKeys: settings.allowAllSpaces ? [] : spaces.split(/[\n,]/u).map(value => value.trim()).filter(Boolean),
  })
  const stageCredential = async (pending: ConfluenceSettings) => {
    const { patRef } = unwrapRemote<{ patRef: string }>(await remoteApi.credentialRef(pending.baseUrl))
    if (pat.trim() === '') return
    await storeConfluenceCredential(credentials, patRef, pat.trim())
  }
  const save = async () => {
    setBusy(true)
    setStatus('saving')
    try {
      const pending = pendingSettings()
      await stageCredential(pending)
      const saved = unwrapRemote<{ settings: ConfluenceSettings }>(await remoteApi.save({ settings: pending }))
      setSettings(saved.settings)
      setSavedSettings(saved.settings)
      setSpaces(saved.settings.allowedSpaceKeys.join('\n'))
      setPat('')
      setStatus('saved')
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : 'saveFailed') }
    finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true); setStatus('testing')
    try {
      const pending = pendingSettings()
      await stageCredential(pending)
      const tested = unwrapRemote<{ version: string }>(await remoteApi.testConnection(pending))
      setStatus(`${t('connected')} · Confluence ${tested.version}`)
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : 'testFailed') }
    finally { setBusy(false) }
  }
  const discard = () => {
    setSettings(savedSettings); setSpaces(savedSettings.allowedSpaceKeys.join('\n')); setPat(''); setStatus('discarded')
  }
  const dirty = pat !== '' || JSON.stringify(pendingSettings()) !== JSON.stringify(savedSettings)
  return <li className={`${css.card}${open ? ` ${css.open}` : ''}`}>
    <button type="button" className={css.header} aria-expanded={open} aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`} onClick={() => setOpen(value => !value)}>
      <span className={css.headText}><span className={css.name}>{t('title')}</span><span className={css.description}>{t('description')}</span></span>
      {dirty && <span className={css.pending}>{t('unsaved')}</span>}
      <IconChevronDownOutline14 className={`${css.chevron}${open ? ` ${css.chevronOpen}` : ''}`} />
    </button>
    {open && <div className={css.body}>
      <label className={css.field}><span className={css.label}>{t('baseUrl')}</span><input className={css.input} value={settings.baseUrl} placeholder="https://wiki.example.com/confluence" onChange={event => update({ baseUrl: event.target.value })} /></label>
      <label className={css.field}><span className={css.label}>{t('token')}</span><input className={css.input} type="password" autoComplete="off" value={pat} onChange={event => setPat(event.target.value)} /></label>
      <label className={css.check}><input type="checkbox" checked={settings.allowAllSpaces} onChange={event => update({ allowAllSpaces: event.target.checked })} />{t('allowAll')}</label>
      {!settings.allowAllSpaces && <label className={css.field}><span className={css.label}>{t('spaces')}</span><textarea className={css.textarea} rows={4} value={spaces} onChange={event => setSpaces(event.target.value)} /></label>}
      <p className={css.status} role="status">{status in en ? t(status as ConfluenceLocaleKey) : status}</p>
      <div className={css.footer}>
        <button type="button" className={css.discard} disabled={!dirty || busy} onClick={discard}>{t('discard')}</button>
        <button type="button" className={css.test} disabled={busy} onClick={() => void test()}>{t('test')}</button>
        <button type="button" className={css.save} disabled={!dirty || busy} onClick={() => void save()}>{t('save')}</button>
      </div>
    </div>}
  </li>
}

export const name = 'confluence-client'
export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remote)
  const feature = ctx.plugin(Object.assign(async (child: ClientContext) => {
    child.effect(() => child.locale.register('settings.plugins.confluence', { zh, en }), 'confluence-client: dictionaries')
    child.slots.inject('settings.plugin.item', function* () {
      yield child.slots.register(CONFLUENCE_CARD_SLOT_OPTIONS,
        (props: { t: (key: ConfluenceLocaleKey) => string }) => <ConfluenceCard remoteApi={child.remote.confluenceSettings} credentials={child.remote.credentials} t={props.t} />)
    })
  }, { inject: ['slots', 'locale', 'remote', 'remote.credentials', 'remote.confluenceSettings'] }))
  await feature
  return async () => { await feature.dispose(); await disposeRemote() }
}
