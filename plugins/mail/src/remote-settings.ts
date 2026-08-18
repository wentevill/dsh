import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import { assertMailSettingsEndpoints, type MailSettings } from './mail-settings.ts'
import type { MailSettingsSaveRequest, MailSettingsSaveResult } from './remote-types.ts'

/** Read the resolved mail section through its owning Host settings scope. */
export function loadMailSettings(scope: SettingsScope<MailSettings>): MailSettingsSaveResult {
  return { settings: scope.get() }
}

/** Commit and reread one mail section through its owning Host settings scope. */
export async function saveMailSettings(
  scope: SettingsScope<MailSettings>,
  request: MailSettingsSaveRequest,
): Promise<MailSettingsSaveResult> {
  assertMailSettingsEndpoints(request.settings)
  await scope.replace(request.settings)
  return { settings: scope.get() }
}
