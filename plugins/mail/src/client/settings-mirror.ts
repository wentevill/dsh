import type { SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { MailSettings } from '../mail-settings.ts'

export interface MailSettingsMirror {
  scope: {
    getSnapshot(): SettingsScopeSnapshot<MailSettings>
    subscribe(listener: () => void): () => void
  }
  accept(settings: MailSettings): void
}

/** Client mirror for Mail settings, whose namespace is not exposed by DSH's settings API. */
export function createMailSettingsMirror(initial: MailSettings): MailSettingsMirror {
  const listeners = new Set<() => void>()
  let snapshot: SettingsScopeSnapshot<MailSettings> = {
    status: 'ready',
    value: initial,
    base: initial,
    user: initial,
    revision: undefined,
    writable: true,
    mode: 'host',
  }
  return {
    scope: {
      getSnapshot: () => snapshot,
      subscribe(listener) {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    accept(settings) {
      snapshot = { ...snapshot, value: settings, user: settings }
      for (const listener of listeners) listener()
    },
  }
}
