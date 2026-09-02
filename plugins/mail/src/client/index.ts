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
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { MailCard } from './MailCard.tsx'
import { MAIL_SETTINGS_NAMESPACE, createMailCardController } from './mail-card-controller.ts'
import { en, zh } from './locales.ts'
import { unwrapMailSettingsSave } from './remote-save.ts'
import { createMailSettingsMirror } from './settings-mirror.ts'
import { MAIL_CARD_SLOT_OPTIONS } from './slot-options.ts'

export { MailCard, createMailCardController, MAIL_CARD_SLOT_OPTIONS, MAIL_SETTINGS_NAMESPACE }
export type { MailCardFace, MailCardState } from './mail-card-controller.ts'

/** Copy namespace owned by this client plugin. */
const NS = 'settings.plugins.mail'

export const name = 'mail-client'
export const inject = ['remote']

/** UI fiber started only after the parent has mounted the Mail Remote namespace. */
export const mailClientFeature = Object.assign(async (ctx: ClientContext): Promise<void> => {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mail-client: dictionaries')

  const loaded = unwrapMailSettingsSave(await ctx.remote.mailSettings.load())
  const mirror = createMailSettingsMirror(loaded.settings)
  const controller = createMailCardController(
    mirror.scope,
    ctx.remote.credentials,
    async settings => {
      const response = await ctx.remote.mailSettings.save({ settings })
      const saved = unwrapMailSettingsSave(response)
      mirror.accept(saved.settings)
      return saved
    },
    true,
  )
  ctx.effect(() => controller.dispose, 'mail-client: settings controller')

  // Re-read the password badge when the Host commits a change from anywhere.
  ctx.effect(
    () => ctx.remote.$on('credentials/updated', () => { controller.refreshCredential() }),
    'mail-client: credential invalidations',
  )

  ctx.slots.inject('settings.plugin.item', function* () {
    yield ctx.slots.register({
      ...MAIL_CARD_SLOT_OPTIONS,
      inject: controller.face,
    }, MailCard)
  })
}, { inject: ['slots', 'locale', 'connection', 'remote', 'remote.mailSettings', 'remote.credentials', 'settingsScope'] })

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(mailRemote)
  const feature = ctx.plugin(mailClientFeature)
  await feature
  return async () => {
    await feature.dispose()
    await disposeRemote()
  }
}
