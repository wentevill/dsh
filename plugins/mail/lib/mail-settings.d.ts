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
/** The user-settings namespace owning this plugin's account form. */
export declare const MAIL_SETTINGS_NAMESPACE: any;
/** SMTP/IMAP endpoint shared shape. */
export interface NetworkEndpoint {
    host: string;
    port: number;
    /** Secure connection on connect (implicit TLS). */
    secure: true;
}
/** The account fields a user configures in the page. No secrets here. */
export interface MailSettings {
    /** Account whose mailbox is read and on whose behalf mail is sent. */
    username: string;
    /** CredentialRef naming the password held in key management. */
    passwordEnv: string;
    /** IMAP mailbox to list/read. */
    mailbox: string;
    /** IMAP receive endpoint. */
    imap: NetworkEndpoint;
    /** SMTP send endpoint. */
    smtp: NetworkEndpoint;
}
/** Schemastery schema rendered as the account form by configuration surfaces. */
export declare const MailSettingsSchema: z<MailSettings>;
