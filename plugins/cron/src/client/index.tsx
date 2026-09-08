import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-tool/client'
import React from 'react'
import cronRemote from '../../lib/typert.remote-client.js'
import type { CronRemotePort } from './controller.ts'
import { en, zh, type CronLocaleKey } from './locales.ts'
import type { CronSessionsPort } from './manager.tsx'
import { CronManagerToolRow } from './suggestion-row.tsx'

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
    inject(name: 'tool.call.toolview', register: () => void): unknown
    register(
      options: { readonly name: 'tool.call.toolview'; readonly key: 'cron_open_manager'; readonly locale: 'cron' },
      component: React.ComponentType<any>,
    ): () => void
  }
}

export const name = 'cron-client'
export const inject = ['remote']

/** Mount generated Remote first, then one injected keyed Tool row contribution. */
export async function apply(base: Context): Promise<() => Promise<void>> {
  const ctx = base as unknown as CronClientContext
  const disposeRemote = await ctx.remote.$mount(cronRemote)
  const feature = ctx.plugin(Object.assign(async (baseChild: Context) => {
    const child = baseChild as unknown as CronClientContext
    child.effect(() => child.locale.register('cron', { zh, en }), 'cron-client: dictionaries')
    child.slots.inject('tool.call.toolview', () => child.slots.register({
        name: 'tool.call.toolview', key: 'cron_open_manager', locale: 'cron',
      }, (props: {
        callId: string
        toolName: string
        block: Parameters<typeof CronManagerToolRow>[0]['block']
        sessionId: Parameters<typeof CronManagerToolRow>[0]['sessionId']
        t: (key: CronLocaleKey) => string
      }) => <CronManagerToolRow {...props} remote={child.remote.cron} sessions={child.sessions} />))
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
