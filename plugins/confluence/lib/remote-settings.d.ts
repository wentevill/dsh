import { credentialRef } from '@deepseek-ai/dsh-credentials';
import type { ConfluenceConnectionResult, ConfluenceSettingsSaveRequest, ConfluenceSettingsSaveResult } from './remote-types.ts';
import { type ConfluenceSettings } from './settings.ts';
import type { FetchConfluenceTransport } from './transport.ts';
interface MutableSettingsScope {
    get(): ConfluenceSettings;
    replace(settings: ConfluenceSettings): Promise<void>;
}
export declare function saveConfluenceSettings(scope: MutableSettingsScope, request: ConfluenceSettingsSaveRequest): Promise<ConfluenceSettingsSaveResult>;
export declare function saveVerifiedConfluenceSettings(scope: MutableSettingsScope, request: ConfluenceSettingsSaveRequest, options: ConnectionTestOptions): Promise<ConfluenceSettingsSaveResult>;
export declare function confluencePatRef(baseUrl: string): string;
interface ConnectionTestOptions {
    credentials: {
        resolve(reference: ReturnType<typeof credentialRef>): Promise<{
            value: string;
        } | undefined>;
    };
    transport: Pick<FetchConfluenceTransport, 'serverInformation' | 'probeSpaces' | 'getSpace'>;
}
export declare function testConfluenceConnection(input: ConfluenceSettings, options: ConnectionTestOptions): Promise<ConfluenceConnectionResult>;
export {};
