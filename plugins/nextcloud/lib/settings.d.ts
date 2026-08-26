import { type AccessMode } from './path-policy.ts';
import z from '@deepseek-ai/schemastery';
export declare const NEXTCLOUD_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
export declare const NEXTCLOUD_PASSWORD_REF = "NEXTCLOUD_APP_PASSWORD";
export interface NextcloudSettings {
    readonly serverUrl: string;
    readonly username: string;
    readonly accessMode: AccessMode;
    readonly allowedRoots: string[];
    readonly allowDelete: boolean;
    readonly allowHttp: boolean;
    readonly skipTlsVerify: boolean;
}
export interface ResolvedNextcloudSettings extends NextcloudSettings {
    readonly davUrl: string;
}
export declare const NextcloudSettingsSchema: z<NextcloudSettings>;
export declare function normalizeNextcloudSettings(settings: NextcloudSettings): ResolvedNextcloudSettings;
