import { type Credentials } from '@deepseek-ai/dsh-credentials';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import { type NextcloudSettings, type ResolvedNextcloudSettings } from './settings.ts';
import { type NextcloudTransport } from './transport.ts';
import type { ResolveService } from './tools.ts';
export type NextcloudTransportFactory = (settings: ResolvedNextcloudSettings, password: string) => NextcloudTransport;
export declare function createServiceResolver(scope: Pick<SettingsScope<NextcloudSettings>, 'get'>, credentials: Pick<Credentials, 'resolve'>, transportFactory?: NextcloudTransportFactory): ResolveService;
