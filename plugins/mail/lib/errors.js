/**
 * Only instances of this Mail-owned class may cross the provider boundary
 * without being collapsed to MAIL_PROVIDER_FAILURE.
 */
const TRUSTED_MAIL_ERROR = Symbol('dsh-mail.trusted-error');
const trustedMailErrors = new WeakSet();
export class MailError extends HarnessError {
    constructor(message, code, trust) {
        super(`${code}: ${message}`, code);
        this.name = 'MailError';
        if (trust === TRUSTED_MAIL_ERROR)
            trustedMailErrors.add(this);
    }
}
/** @internal Mail sources use this issuer; the constructor alone is never trusted. */
export function mailError(message, code) {
    return new MailError(message, code, TRUSTED_MAIL_ERROR);
}
export function isTrustedMailError(error) {
    return error instanceof MailError && trustedMailErrors.has(error);
}
export function mailProviderFailure(_cause) {
    return mailError('mail provider operation failed', 'MAIL_PROVIDER_FAILURE');
}
const MAX_IMAP_UID = 0xffffffff;
export function assertMailUid(value) {
    if (typeof value !== 'string'
        || !/^[1-9][0-9]*$/u.test(value)
        || Number(value) > MAX_IMAP_UID) {
        throw mailError('message UID must be an integer between 1 and 4294967295', 'MAIL_UID_INVALID');
    }
    return value;
}
import { HarnessError } from '@deepseek-ai/dsh-llm';
