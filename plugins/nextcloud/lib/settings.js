import { createPathPolicy } from "./path-policy.js";
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
export const NEXTCLOUD_SETTINGS_NAMESPACE = settingsNamespace('nextcloud');
export const NEXTCLOUD_PASSWORD_REF = 'NEXTCLOUD_APP_PASSWORD';
export const NextcloudSettingsSchema = z.object({
    serverUrl: z.string().default(''),
    username: z.string().default(''),
    accessMode: z.union([z.const('all'), z.const('allowlist')]).default('all'),
    allowedRoots: z.array(z.string()).default([]),
    allowDelete: z.boolean().default(false),
    allowHttp: z.boolean().default(false),
    skipTlsVerify: z.boolean().default(false),
});
function validatedServerUrl(value, allowHttp) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('invalid Nextcloud server URL');
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
        throw new Error('invalid Nextcloud server URL');
    }
    if (url.protocol === 'http:' && !allowHttp)
        throw new Error('Nextcloud HTTP is disabled');
    return url;
}
export function normalizeNextcloudSettings(settings) {
    const username = settings.username.trim();
    if (username.length === 0 || /[\r\n/]/u.test(username))
        throw new Error('invalid Nextcloud username');
    const url = validatedServerUrl(settings.serverUrl.trim(), settings.allowHttp);
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/u, '');
    const policy = createPathPolicy(settings);
    const serverUrl = `${url.origin}${pathname}`;
    return {
        ...settings,
        serverUrl,
        username,
        allowedRoots: [...policy.roots],
        davUrl: `${serverUrl}/remote.php/dav/files/${encodeURIComponent(username)}`,
    };
}
