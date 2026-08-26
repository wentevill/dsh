import type { SettingsScope } from '@deepseek-ai/dsh-settings'
import type { NextcloudSettingsSaveRequest, NextcloudSettingsSaveResult } from './remote-types.ts'
import { normalizeNextcloudSettings, type NextcloudSettings } from './settings.ts'

export function loadNextcloudSettings(scope: Pick<SettingsScope<NextcloudSettings>, 'get'>): NextcloudSettingsSaveResult {
  return { settings: scope.get() }
}

export async function saveNextcloudSettings(
  scope: Pick<SettingsScope<NextcloudSettings>, 'get' | 'replace'>,
  request: NextcloudSettingsSaveRequest,
): Promise<NextcloudSettingsSaveResult> {
  const server = request.settings.serverUrl.trim()
  const username = request.settings.username.trim()
  if ((server === '') !== (username === '')) throw new Error('Nextcloud requires both server URL and username')
  const settings: NextcloudSettings = server === ''
    ? { ...request.settings, serverUrl: '', username: '', accessMode: 'all', allowedRoots: [] }
    : normalizeNextcloudSettings(request.settings)
  const { davUrl: _davUrl, ...persisted } = settings as NextcloudSettings & { davUrl?: string }
  await scope.replace(persisted)
  return { settings: scope.get() }
}
