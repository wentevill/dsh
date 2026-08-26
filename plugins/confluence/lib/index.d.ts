import type { Context } from '@deepseek-ai/cordis';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ConfluenceConnectionResult, ConfluenceCredentialRefResult, ConfluenceSettingsSaveRequest, ConfluenceSettingsSaveResult } from './remote-types.ts';
import type { ConfluenceSettings } from './settings.ts';
import { FetchConfluenceTransport } from './transport.ts';
import type { Config as ConfluenceConfig } from './config.ts';
export * from './errors.ts';
export * from './settings.ts';
export * from './transport.ts';
export { ConfluenceCapabilityManager } from './tools.ts';
export { createConfluenceApprovalPolicy } from './approval.ts';
export { Config } from './config.ts';
export type { Config as ConfluenceConfig } from './config.ts';
export declare class ConfluenceSettingsRemote extends TypertRemoteService {
    private readonly scope;
    private readonly transport;
    constructor(ctx: Context, scope: () => SettingsScope<ConfluenceSettings> | undefined, transport: FetchConfluenceTransport);
    load(): ConfluenceSettingsSaveResult;
    credentialRef(baseUrl: string): ConfluenceCredentialRefResult;
    save(request: ConfluenceSettingsSaveRequest): Promise<ConfluenceSettingsSaveResult>;
    testConnection(settings: ConfluenceSettings): Promise<ConfluenceConnectionResult>;
}
export declare const name = "confluence";
export declare const inject: string[];
export declare function apply(ctx: Context, config: ConfluenceConfig): void;
