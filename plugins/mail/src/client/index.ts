/**
 * Browser half of the mail plugin: the SMTP/IMAP configuration card in the
 * Plugins settings section. Non-secret fields commit to the `mail` settings
 * namespace; the password is written through the credentials domain.
 *
 * Reference client bundle. It is compiled with the DSH web client build
 * (DSH_BUILD_FACE=client) and depends on the harness slot/store conventions;
 * it must be built and exercised inside the harness client workspace.
 */

// Type-only: pulls the ctx.settingsScope Context merge and the slot type for
// `settings.plugin.item`. Cross-plugin collaboration goes through types only.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import mailRemote from '../../lib/typert.remote-client.js'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { MailCard } from './MailCard.tsx'
import { MAIL_SETTINGS_NAMESPACE, createMailCardController } from './mail-card-controller.ts'
import { en, zh } from './locales.ts'
import { unwrapMailSettingsSave } from './remote-save.ts'
import { createMailSettingsMirror } from './settings-mirror.ts'

export { MailCard, createMailCardController, MAIL_SETTINGS_NAMESPACE }
export type { MailCardFace, MailCardState } from './mail-card-controller.ts'

/** Copy namespace owned by this client plugin. */
const NS = 'settings.plugins.mail'

export const name = 'mail-plugin-client'
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.mailSettings', 'settingsScope']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const { api } = ctx.get('connection') as ConnectionHandle
  const disposeRemote = await ctx.remote.$mount(mailRemote)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mail-plugin-client: dictionaries')

  const loaded = unwrapMailSettingsSave(await ctx.remote.mailSettings.load())
  const mirror = createMailSettingsMirror(loaded.settings)
  const controller = createMailCardController(
    mirror.scope,
    api,
    async settings => {
      const response = await ctx.remote.mailSettings.save({ settings })
      const saved = unwrapMailSettingsSave(response)
      mirror.accept(saved.settings)
      return saved
    },
    true,
  )

  // Re-read the password badge when the Host commits a change from anywhere.
  ctx.effect(
    () => ctx.remote.$on('credentials/updated', () => { controller.refreshCredential() }),
    'mail-plugin-client: credential invalidations',
  )

  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      name: 'settings.plugin.item',
      id: 'mail',
      order: 30,
      locale: NS,
      inject: controller.face,
    }, MailCard)
  })
  return disposeRemote
}
