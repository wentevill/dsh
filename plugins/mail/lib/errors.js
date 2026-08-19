/**
 * Only instances of this Mail-owned class may cross the provider boundary
 * without being collapsed to MAIL_PROVIDER_FAILURE.
 */
export class MailError extends Error {
    code;
    constructor(message, code) {
        super(`${code}: ${message}`);
        this.name = 'MailError';
        this.code = code;
    }
    static providerFailure(_cause) {
        return new MailError('mail provider operation failed', 'MAIL_PROVIDER_FAILURE');
    }
}
const MAX_IMAP_UID = 0xffffffff;
export function assertMailUid(value) {
    if (typeof value !== 'string'
        || !/^[1-9][0-9]*$/u.test(value)
        || Number(value) > MAX_IMAP_UID) {
        throw new MailError('message UID must be an integer between 1 and 4294967295', 'MAIL_UID_INVALID');
    }
    return value;
}
