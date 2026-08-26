import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import managerRemote from '../../lib/typert.remote-client.js'
import { PluginManagerTab } from './PluginManagerTab.tsx'
import { en, zh, type PluginManagerLocaleKey } from './locales.ts'
import { createPluginManagerPort } from './port.ts'
import { PLUGIN_MANAGER_TAB_OPTIONS } from './slot-options.ts'
import { PLUGIN_MANAGER_CSS } from './styles.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.plugins.manager': PluginManagerLocaleKey
  }
}

const NS = 'settings.plugins.manager'

export const pluginManagerClientFeature = Object.assign((ctx: ClientContext): void => {
  const t = ctx.locale.bind(NS)
  const port = createPluginManagerPort(ctx.remote.pluginManager)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'plugin-manager: dictionaries')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshPluginManager = 'true'
    style.textContent = PLUGIN_MANAGER_CSS
    document.head.append(style)
    return () => { style.remove() }
  }, 'plugin-manager: styles')
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    ...PLUGIN_MANAGER_TAB_OPTIONS,
    label: () => t('tab'),
    inject: () => ({ list: port.list, install: port.install, uninstall: port.uninstall }),
  }, PluginManagerTab as never))
}, { inject: ['slots', 'locale', 'remote', 'remote.pluginManager'] })

export const inject = ['remote']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(managerRemote)
  const feature = ctx.plugin(pluginManagerClientFeature)
  await feature
  return async () => {
    await feature.dispose()
    await disposeRemote()
  }
}

export { PluginManagerTab, PLUGIN_MANAGER_TAB_OPTIONS }
