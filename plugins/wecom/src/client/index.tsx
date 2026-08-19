import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import React, { useCallback, useEffect, useState } from 'react'
import remote from '../../lib/typert.remote-client.js'

type Snapshot =
  | { state: 'unauthorized' | 'generating_qr' | 'deleting' }
  | { state: 'awaiting_scan'; qrDataUrl: string }
  | { state: 'authorized' | 'refreshing_schema'; botId?: string }
  | { state: 'ready'; botId?: string; toolCount: number }
  | { state: 'sync_failed'; botId?: string; message: string }

const labels = {
  title: '企业微信 AI', description: '连接企业微信 AI 开放能力，授权后自动发现并注册 API 工具。',
  authorize: '授权企业微信', cancel: '取消', refresh: '刷新 API', remove: '删除授权',
  unauthorized: '未授权', generating_qr: '正在生成二维码…', awaiting_scan: '请使用企业微信扫码授权',
  authorized: '已授权', refreshing_schema: '正在同步 API…', ready: '已就绪', deleting: '正在删除授权…', sync_failed: '同步失败',
}

function WeComCard({ api }: { api: any }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ state: 'unauthorized' })
  const [busy, setBusy] = useState(false)
  const refreshStatus = useCallback(async () => setSnapshot(await api.status()), [api])
  useEffect(() => {
    void refreshStatus()
    const timer = setInterval(() => { void refreshStatus() }, 1_000)
    return () => clearInterval(timer)
  }, [refreshStatus])
  const run = async (operation: () => Promise<Snapshot> | Snapshot) => {
    setBusy(true)
    try { setSnapshot(await operation()) } finally { setBusy(false) }
  }
  const authorized = ['authorized', 'refreshing_schema', 'ready', 'sync_failed'].includes(snapshot.state)
  return <section style={{ border: '1px solid var(--color-border, #ddd)', borderRadius: 12, padding: 16 }}>
    <h3 style={{ marginTop: 0 }}>{labels.title}</h3>
    <p>{labels.description}</p>
    <p role="status"><strong>{labels[snapshot.state]}</strong>
      {'botId' in snapshot && snapshot.botId ? ` · Bot ${snapshot.botId}` : ''}
      {snapshot.state === 'ready' ? ` · ${snapshot.toolCount} APIs` : ''}
    </p>
    {snapshot.state === 'awaiting_scan' && <img src={snapshot.qrDataUrl} alt="企业微信授权二维码" width={240} height={240} />}
    {snapshot.state === 'sync_failed' && <p style={{ color: 'var(--color-danger, #c33)' }}>{snapshot.message}</p>}
    {!authorized && snapshot.state !== 'awaiting_scan' && snapshot.state !== 'generating_qr' &&
      <button disabled={busy} onClick={() => void run(() => api.connect())}>{labels.authorize}</button>}
    {(snapshot.state === 'awaiting_scan' || snapshot.state === 'generating_qr') &&
      <button disabled={busy} onClick={() => void run(() => api.cancel())}>{labels.cancel}</button>}
    {authorized && <div style={{ display: 'flex', gap: 8 }}>
      <button disabled={busy} onClick={() => void run(() => api.refresh())}>{labels.refresh}</button>
      <button disabled={busy} onClick={() => {
        if (globalThis.confirm('确定删除企业微信授权？删除后相关 API 工具会立即移除。')) void run(() => api.deleteAuthorization(true))
      }}>{labels.remove}</button>
    </div>}
  </section>
}

export const name = 'wecom-client'
export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(remote)
  const feature = ctx.plugin(Object.assign(async (child: ClientContext) => {
    child.slots.inject('settings.plugin.item', function* () {
      yield child.slots.register({ name: 'settings.plugin.item', id: 'wecom', order: 35, locale: 'settings.plugins.wecom' },
        () => <WeComCard api={child.remote.wecomAuth} />)
    })
  }, { inject: ['slots', 'remote', 'remote.wecomAuth'] }))
  await feature
  return async () => { await feature.dispose(); await disposeRemote() }
}
