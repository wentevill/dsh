import type { MailSettings } from './mail-settings.ts'

/** Strict Client request for replacing the mail-owned user settings section. */
export interface MailSettingsSaveRequest {
  readonly settings: MailSettings
}

/** Authoritative resolved settings returned after a durable Host commit. */
export interface MailSettingsSaveResult {
  readonly settings: MailSettings
}
