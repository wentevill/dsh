import { HarnessError } from '@deepseek-ai/dsh-llm';
export class NextcloudError extends HarnessError {
    code;
    constructor(message, code) {
        super(`${code}: ${message}`, code);
        this.code = code;
        this.name = 'NextcloudError';
    }
}
export function nextcloudProviderError(cause) {
    const status = cause?.status;
    const mapping = {
        401: ['NEXTCLOUD_AUTH_FAILED', 'Nextcloud authentication failed'],
        403: ['NEXTCLOUD_FORBIDDEN', 'Nextcloud denied this operation'],
        404: ['NEXTCLOUD_NOT_FOUND', 'Nextcloud path was not found'],
        409: ['NEXTCLOUD_CONFLICT', 'Nextcloud reported a path conflict'],
        507: ['NEXTCLOUD_QUOTA_EXCEEDED', 'Nextcloud quota is insufficient'],
    };
    const resolved = typeof status === 'number' ? mapping[status] : undefined;
    return resolved === undefined
        ? new NextcloudError('Nextcloud provider operation failed', 'NEXTCLOUD_PROVIDER_FAILED')
        : new NextcloudError(resolved[1], resolved[0]);
}
