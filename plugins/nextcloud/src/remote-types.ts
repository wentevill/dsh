import type { NextcloudSettings } from './settings.ts'

export interface NextcloudSettingsSaveRequest {
  readonly settings: NextcloudSettings
}

export interface NextcloudSettingsSaveResult {
  readonly settings: NextcloudSettings
}

export interface NextcloudConnectionResult {
  readonly ok: true
  readonly root: string
}
