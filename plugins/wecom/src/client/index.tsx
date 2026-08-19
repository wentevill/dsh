import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import React, { useCallback, useEffect, useState } from 'react'
import remote from '../../lib/typert.remote-client.js'
import { WECOM_CARD_SLOT_OPTIONS } from './slot-options.ts'
import { unwrapAuthResult } from './remote-result.ts'
import type { WeComAuthSnapshot } from '../remote-types.ts'
import { en, zh, type WeComLocaleKey } from './locales.ts'
import { css, ensureWeComCardCSS } from './card-css.ts'

type Snapshot = WeComAuthSnapshot

const NS = 'settings.plugins.wecom'

function WeComCard({ api, t }: { api: any; t: (key: WeComLocaleKey) => string }) {
  ensureWeComCardCSS()
  const [snapshot, setSnapshot] = useState<Snapshot>({ state: 'unauthorized' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const refreshStatus = useCallback(async () => {
    try { setSnapshot(unwrapAuthResult(await api.status())); setError(undefined) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('remoteFailed')) }
  }, [api, t])
  useEffect(() => {
    void refreshStatus()
    const timer = setInterval(() => { void refreshStatus() }, 1_000)
    return () => clearInterval(timer)
  }, [refreshStatus])
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true)
    setError(undefined)
    try { setSnapshot(unwrapAuthResult(await operation() as Parameters<typeof unwrapAuthResult>[0])) }
    catch (cause) { setError(cause instanceof Error ? cause.message : t('remoteFailed')) }
    finally { setBusy(false) }
  }
  const authorized = ['authorized', 'refreshing_schema', 'ready', 'sync_failed'].includes(snapshot.state)
  return <li className={css.card}>
    <div className={css.heading}><h3 className={css.title}>{t('title')}</h3><p className={css.description}>{t('description')}</p></div>
    <p className={css.status} role="status"><strong>{t(snapshot.state)}</strong>
      {'botId' in snapshot && snapshot.botId ? ` · ${t('botId').replace('{id}', snapshot.botId)}` : ''}
      {snapshot.state === 'ready' ? ` · ${t('toolCount').replace('{count}', String(snapshot.toolCount))}` : ''}
    </p>
    {snapshot.state === 'awaiting_scan' && <img className={css.qr} src={snapshot.qrDataUrl} alt={t('qrAlt')} width={240} height={240} />}
    {snapshot.state === 'sync_failed' && <p className={css.error}>{snapshot.message}</p>}
    {error && <p className={css.error} role="alert">{error}</p>}
    <div className={css.actions}>
      {!authorized && snapshot.state !== 'awaiting_scan' && snapshot.state !== 'generating_qr' &&
        <button type="button" className={css.primary} disabled={busy} onClick={() => void run(() => api.connect())}>{t('authorize')}</button>}
      {(snapshot.state === 'awaiting_scan' || snapshot.state === 'generating_qr') &&
        <button type="button" className={css.secondary} disabled={busy} onClick={() => void run(() => api.cancel())}>{t('cancel')}</button>}
      {authorized && <>
      <button type="button" className={css.primary} disabled={busy} onClick={() => void run(() => api.refresh())}>{t('refresh')}</button>
      <button type="button" className={css.danger} disabled={busy} onClick={() => {
        if (globalThis.confirm(t('deleteConfirm'))) void run(() => api.deleteAuthorization(true))
      }}>{t('remove')}</button></>}
    </div>
  </li>
}

export const name = 'wecom-client'
export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remote)
  const feature = ctx.plugin(Object.assign(async (child: ClientContext) => {
    child.effect(() => child.locale.register(NS, { zh, en }), 'wecom-client: dictionaries')
    child.slots.inject('settings.plugin.item', function* () {
      yield child.slots.register(WECOM_CARD_SLOT_OPTIONS,
        (props: { t: (key: WeComLocaleKey) => string }) => <WeComCard api={child.remote.wecomAuth} t={props.t} />)
    })
  }, { inject: ['slots', 'locale', 'remote', 'remote.wecomAuth'] }))
  await feature
  return async () => { await feature.dispose(); await disposeRemote() }
}
