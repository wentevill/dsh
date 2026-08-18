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
    imap: endpoint(993),
    smtp: endpoint(465),
});
