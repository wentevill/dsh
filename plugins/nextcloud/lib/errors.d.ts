import { HarnessError } from '@deepseek-ai/dsh-llm';
export type NextcloudErrorCode = 'NEXTCLOUD_AUTH_FAILED' | 'NEXTCLOUD_FORBIDDEN' | 'NEXTCLOUD_NOT_FOUND' | 'NEXTCLOUD_CONFLICT' | 'NEXTCLOUD_QUOTA_EXCEEDED' | 'NEXTCLOUD_PROVIDER_FAILED';
export declare class NextcloudError extends HarnessError {
    readonly code: NextcloudErrorCode;
    constructor(message: string, code: NextcloudErrorCode);
}
export declare function nextcloudProviderError(cause: unknown): NextcloudError;
