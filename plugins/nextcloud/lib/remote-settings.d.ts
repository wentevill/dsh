import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import type { NextcloudSettingsSaveRequest, NextcloudSettingsSaveResult } from './remote-types.ts';
import { type NextcloudSettings } from './settings.ts';
export declare function loadNextcloudSettings(scope: Pick<SettingsScope<NextcloudSettings>, 'get'>): NextcloudSettingsSaveResult;
export declare function saveNextcloudSettings(scope: Pick<SettingsScope<NextcloudSettings>, 'get' | 'replace'>, request: NextcloudSettingsSaveRequest): Promise<NextcloudSettingsSaveResult>;
