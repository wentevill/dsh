/**
 * The mail plugin's configuration surface: one user-settings namespace `mail`
 * that the web GUI renders as the SMTP/IMAP account form.
 *
 * The namespace carries ONLY non-secret account fields. The password is never
 * stored here — the end user enters it in the same page and the card writes it
 * through the DSH key-management component (`ctx.credentials.set`) addressed
 * by the `passwordEnv` reference this section names. The Host side resolves it
 * with `ctx.credentials.resolve` on every operation.
 */
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
/** The user-settings namespace owning this plugin's account form. */
export const MAIL_SETTINGS_NAMESPACE = settingsNamespace('mail');
/** Enforce the transport invariant only for an endpoint that is enabled by host. */
export function assertConfiguredEndpoint(label, value) {
    if (value.host.trim() === '')
        return;
    if (value.secure !== true)
        throw new Error(`mail: ${label} must use TLS`);
    if (!Number.isInteger(value.port) || value.port < 1 || value.port > 65535) {
        throw new Error(`mail: ${label} port must be between 1 and 65535`);
    }
}
/** Validate both independently enabled endpoints before they are persisted or used. */
export function assertMailSettingsEndpoints(settings) {
    assertConfiguredEndpoint('IMAP', settings.imap);
    assertConfiguredEndpoint('SMTP', settings.smtp);
}
/** Derive operation availability from endpoint configuration and deletion consent. */
export function mailCapabilities(settings) {
    const imap = settings.imap.host.trim() !== '';
    return { imap, smtp: settings.smtp.host.trim() !== '', delete: imap && settings.allowDelete };
}
/** Endpoint schema for a given default port (`imap` 993, `smtp` 465). */
function endpoint(portDefault) {
    return z.object({
        host: z.string().default(''),
        port: z.number().step(1).min(1).max(65535).default(portDefault),
        secure: z.boolean().default(true),
    });
}
/** Schemastery schema rendered as the account form by configuration surfaces. */
export const MailSettingsSchema = z.object({
    username: z.string().default(''),
    passwordEnv: z.string().role('credential-ref').default('MAIL_APP_PASSWORD'),
    mailbox: z.string().default('INBOX'),
    archiveMailbox: z.string().default('Archive'),
    allowDelete: z.boolean().default(false),
    imap: endpoint(993),
    smtp: endpoint(465),
});
