import type { Context } from '@deepseek-ai/cordis';
import type { Credentials } from '@deepseek-ai/dsh-credentials';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { NextcloudConnectionResult, NextcloudSettingsSaveRequest, NextcloudSettingsSaveResult } from './remote-types.ts';
import { type NextcloudSettings } from './settings.ts';
export type Config = NextcloudSettings;
export declare const Config: import("@deepseek-ai/schemastery").default<NextcloudSettings>;
export declare const name = "nextcloud";
export declare const inject: string[];
export declare class NextcloudSettingsRemote extends TypertRemoteService {
    private readonly scope;
    private readonly credentials;
    constructor(ctx: Context, scope: () => SettingsScope<NextcloudSettings> | undefined, credentials: Pick<Credentials, 'resolve'>);
    load(): NextcloudSettingsSaveResult;
    save(request: NextcloudSettingsSaveRequest): Promise<NextcloudSettingsSaveResult>;
    testConnection(): Promise<NextcloudConnectionResult>;
}
export declare function apply(ctx: Context, config: Config): void;
export { NextcloudFileService } from './service.ts';
export { NextcloudSharingService } from './sharing-service.ts';
export type * from './sharing-types.ts';
export { createNextcloudTransport, NextcloudTransport } from './transport.ts';
export { createNextcloudApprovalPolicy, NextcloudToolManager } from './tools.ts';
export type * from './remote-types.ts';
