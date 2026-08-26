import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import React, { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import remote from '../../lib/typert.remote-client.js'
import type { ConfluenceSettings } from '../settings.ts'
import { CONFLUENCE_CARD_SLOT_OPTIONS } from './slot-options.ts'
import { unwrapRemote } from './remote-result.ts'
import { css, ensureCardCSS } from './card-css.ts'

const EMPTY: ConfluenceSettings = { baseUrl: '', allowAllSpaces: false, allowedSpaceKeys: [] }

function ConfluenceCard({ remoteApi, credentials }: { remoteApi: any; credentials: any }) {
  const initialRemote = useRef(remoteApi)
  const [settings, setSettings] = useState(EMPTY)
  const [savedSettings, setSavedSettings] = useState(EMPTY)
  const [pat, setPat] = useState('')
  const [spaces, setSpaces] = useState('')
  const [status, setStatus] = useState('未配置')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  ensureCardCSS()
  useEffect(() => {
    void initialRemote.current.load().then((response: any) => {
      const value = unwrapRemote<{ settings: ConfluenceSettings }>(response)
      setSettings(value.settings)
      setSavedSettings(value.settings)
      setSpaces(value.settings.allowedSpaceKeys.join('\n'))
    }).catch((cause: unknown) => setStatus(cause instanceof Error ? cause.message : '加载失败'))
  }, [])
  const update = (patch: Partial<ConfluenceSettings>) => setSettings(current => ({ ...current, ...patch }))
  const pendingSettings = (): ConfluenceSettings => ({
    ...settings,
    allowedSpaceKeys: settings.allowAllSpaces ? [] : spaces.split(/[\n,]/u).map(value => value.trim()).filter(Boolean),
  })
  const stageCredential = async (pending: ConfluenceSettings) => {
    const { patRef } = unwrapRemote<{ patRef: string }>(await remoteApi.credentialRef(pending.baseUrl))
    if (pat.trim() === '') return
    const result = await credentials.set({ ref: patRef, value: pat.trim() })
    if (result?.result?.ok !== true) throw new Error('Token 保存失败')
  }
  const save = async () => {
    setBusy(true)
    setStatus('正在保存…')
    try {
      const pending = pendingSettings()
      await stageCredential(pending)
      const saved = unwrapRemote<{ settings: ConfluenceSettings }>(await remoteApi.save({ settings: pending }))
      setSettings(saved.settings)
      setSavedSettings(saved.settings)
      setSpaces(saved.settings.allowedSpaceKeys.join('\n'))
      setPat('')
      setStatus('已保存')
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : '保存失败') }
    finally { setBusy(false) }
  }
  const test = async () => {
    setBusy(true); setStatus('正在测试…')
    try {
      const pending = pendingSettings()
      await stageCredential(pending)
      const tested = unwrapRemote<{ version: string }>(await remoteApi.testConnection(pending))
      setStatus(`连接成功 · Confluence ${tested.version}`)
    } catch (cause) { setStatus(cause instanceof Error ? cause.message : '测试失败') }
    finally { setBusy(false) }
  }
  const discard = () => {
    setSettings(savedSettings); setSpaces(savedSettings.allowedSpaceKeys.join('\n')); setPat(''); setStatus('已放弃修改')
  }
  const dirty = pat !== '' || JSON.stringify(pendingSettings()) !== JSON.stringify(savedSettings)
  return <li className={`${css.card}${open ? ` ${css.open}` : ''}`}>
    <button type="button" className={css.header} aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className={css.headText}><span className={css.name}>Confluence Data Center</span><span className={css.description}>配置页面访问地址、Token 与允许空间。</span></span>
      {dirty && <span className={css.pending}>未保存</span>}
      <IconChevronDownOutline14 className={`${css.chevron}${open ? ` ${css.chevronOpen}` : ''}`} />
    </button>
    {open && <div className={css.body}>
      <label className={css.field}><span className={css.label}>HTTPS 基础地址</span><input className={css.input} value={settings.baseUrl} placeholder="https://wiki.example.com/confluence" onChange={event => update({ baseUrl: event.target.value })} /></label>
      <label className={css.field}><span className={css.label}>Personal Access Token</span><input className={css.input} type="password" autoComplete="off" value={pat} onChange={event => setPat(event.target.value)} /></label>
      <label className={css.check}><input type="checkbox" checked={settings.allowAllSpaces} onChange={event => update({ allowAllSpaces: event.target.checked })} />允许 Token 可访问的全部空间</label>
      {!settings.allowAllSpaces && <label className={css.field}><span className={css.label}>允许的 Space Key（每行一个）</span><textarea className={css.textarea} rows={4} value={spaces} onChange={event => setSpaces(event.target.value)} /></label>}
      <p className={css.status} role="status">{status}</p>
      <div className={css.footer}>
        <button type="button" className={css.discard} disabled={!dirty || busy} onClick={discard}>放弃修改</button>
        <button type="button" className={css.test} disabled={busy} onClick={() => void test()}>测试连接</button>
        <button type="button" className={css.save} disabled={!dirty || busy} onClick={() => void save()}>保存</button>
      </div>
    </div>}
  </li>
}

export const name = 'confluence-client'
export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remote)
  const feature = ctx.plugin(Object.assign(async (child: ClientContext) => {
    const { api } = child.get('connection') as ConnectionHandle
    child.slots.inject('settings.plugin.item', function* () {
      yield child.slots.register(CONFLUENCE_CARD_SLOT_OPTIONS,
        () => <ConfluenceCard remoteApi={child.remote.confluenceSettings} credentials={api.credentials} />)
    })
  }, { inject: ['slots', 'connection', 'remote', 'remote.confluenceSettings'] }))
  await feature
  return async () => { await feature.dispose(); await disposeRemote() }
}
