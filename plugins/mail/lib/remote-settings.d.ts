import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import type { MailSettings } from './mail-settings.ts';
import type { MailSettingsSaveRequest, MailSettingsSaveResult } from './remote-types.ts';
/** Commit and reread one mail section through its owning Host settings scope. */
export declare function saveMailSettings(scope: SettingsScope<MailSettings>, request: MailSettingsSaveRequest): Promise<MailSettingsSaveResult>;
