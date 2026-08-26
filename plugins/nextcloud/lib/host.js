import { createHash } from 'node:crypto';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { NextcloudFileService } from "./service.js";
import { NextcloudSharingService } from "./sharing-service.js";
import { NEXTCLOUD_PASSWORD_REF, normalizeNextcloudSettings } from "./settings.js";
import { createNextcloudTransport } from "./transport.js";
export function createServiceResolver(scope, credentials, transportFactory = createNextcloudTransport) {
    return async () => {
        const current = scope.get();
        if (current.serverUrl.trim() === '' || current.username.trim() === '')
            throw new Error('Nextcloud account is not configured');
        const settings = normalizeNextcloudSettings(current);
        const credential = await credentials.resolve(credentialRef(NEXTCLOUD_PASSWORD_REF));
        if (credential === undefined)
            throw new Error('Nextcloud application password is not configured');
        const fingerprint = createHash('sha256').update(JSON.stringify(settings)).update('\0').update(credential.value).digest('hex');
        const transport = transportFactory(settings, credential.value);
        const service = new NextcloudFileService(transport, settings);
        return {
            service,
            sharing: new NextcloudSharingService(transport.sharing, service, settings),
            fingerprint,
        };
    };
}
