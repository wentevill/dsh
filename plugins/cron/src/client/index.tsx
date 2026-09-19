import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { GlobalStandardProps } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import React from 'react'
import cronRemote from '../../lib/typert.remote-client.js'
import type { CronRemotePort } from './controller.ts'
import { en, zh, type CronLocaleKey } from './locales.ts'
import { CronManager, type CronSessionsPort } from './manager.tsx'
import { CronManagerToolRow, type CronManagerToolRowProps } from './suggestion-row.tsx'
import { css, ensureCronStyles } from './styles.ts'

type CronClientContext = Omit<Context, 'remote' | 'sessions'> & {
  readonly remote: {
    readonly cron: CronRemotePort
    $mount(remote: unknown): Promise<() => void | Promise<void>>
  }
  readonly sessions: CronSessionsPort
  readonly locale: {
    register(namespace: 'cron', dictionaries: { readonly zh: typeof zh; readonly en: typeof en }): () => void
  }
  readonly slots: {
    inject(name: 'tool.call.toolview' | 'plugins.bundle.config', register: () => void): unknown
    register(
      options: { readonly name: 'tool.call.toolview'; readonly key: 'cron_open_manager'; readonly locale: 'cron' },
      component: React.ComponentType<CronManagerToolRowProps>,
    ): () => void
    register(
      options: { readonly name: 'plugins.bundle.config'; readonly key: 'dsh-cron'; readonly locale: 'cron' },
      component: React.ComponentType<CronBundleSlotProps>,
    ): () => void
  }
}

type CronBundleSlotProps = PluginConfigViewProps & Pick<GlobalStandardProps, 'useSessions'> & {
  readonly t: (key: CronLocaleKey) => string
}

interface CronBundleManagerProps extends CronBundleSlotProps {
  readonly remote: CronRemotePort
  readonly sessions: CronSessionsPort
}

function CronBundleManager(props: CronBundleManagerProps) {
  ensureCronStyles()
  const sessionId = props.useSessions(state => state.current)
  if (props.view !== 'page') return null
  if (sessionId === undefined) return <p className={css.notice} role="status">{props.t('noCurrentSession')}</p>
  return <CronManager
    sessionId={sessionId} initial={{ scope: 'all' }} remote={props.remote}
    sessions={props.sessions} t={props.t}
  />
}

export const name = 'cron-client'
export const inject = ['remote']

/** Mount generated Remote first, then the conversation and plugin-page contributions. */
export async function apply(base: Context): Promise<() => Promise<void>> {
  const ctx = base as unknown as CronClientContext
  const disposeRemote = await ctx.remote.$mount(cronRemote)
  const feature = ctx.plugin(Object.assign(async (baseChild: Context) => {
    const child = baseChild as unknown as CronClientContext
    child.effect(() => child.locale.register('cron', { zh, en }), 'cron-client: dictionaries')
    child.slots.inject('tool.call.toolview', () => child.slots.register({
        name: 'tool.call.toolview', key: 'cron_open_manager', locale: 'cron',
    }, (props: CronManagerToolRowProps) => <CronManagerToolRow
      {...props} remote={child.remote.cron} sessions={child.sessions}
    />))
    child.slots.inject('plugins.bundle.config', () => child.slots.register({
      name: 'plugins.bundle.config', key: 'dsh-cron', locale: 'cron',
    }, (props: Omit<CronBundleManagerProps, 'remote' | 'sessions'>) => <CronBundleManager
      {...props} remote={child.remote.cron} sessions={child.sessions}
    />))
  }, { inject: ['slots', 'locale', 'remote', 'remote.cron', 'sessions'] }))
  try {
    await feature
  } catch (error) {
    await feature.dispose()
    await disposeRemote()
    throw error
  }
  return async () => {
    await feature.dispose()
    await disposeRemote()
  }
}
