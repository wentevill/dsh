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
/** Client-safe settings validation failure; Host boundaries translate its code to MailError. */
export declare class MailSettingsValidationError extends Error {
    readonly code: 'MAIL_TLS_REQUIRED' | 'MAIL_INPUT_INVALID';
    constructor(message: string, code: 'MAIL_TLS_REQUIRED' | 'MAIL_INPUT_INVALID');
}
/** The user-settings namespace owning this plugin's account form. */
export declare const MAIL_SETTINGS_NAMESPACE: Branded<"SettingsNamespace">;
/** SMTP/IMAP endpoint shared shape. */
export interface NetworkEndpoint {
    host: string;
    port: number;
    /** Secure connection on connect (implicit TLS). */
    secure: boolean;
}
/** Enforce the transport invariant only for an endpoint that is enabled by host. */
export declare function assertConfiguredEndpoint(label: 'IMAP' | 'SMTP', value: Readonly<NetworkEndpoint>): void;
/** The account fields a user configures in the page. No secrets here. */
export interface MailSettings {
    /** Account whose mailbox is read and on whose behalf mail is sent. */
    username: string;
    /** CredentialRef naming the password held in key management. */
    passwordEnv: string;
    /** IMAP mailbox to list/read. */
    mailbox: string;
    /** IMAP mailbox where archived messages are moved. */
    archiveMailbox: string;
    /** Whether permanently deleting a message is available. */
    allowDelete: boolean;
    /** IMAP receive endpoint. */
    imap: NetworkEndpoint;
    /** SMTP send endpoint. */
    smtp: NetworkEndpoint;
}
/** Validate both independently enabled endpoints before they are persisted or used. */
export declare function assertMailSettingsEndpoints(settings: Pick<MailSettings, 'imap' | 'smtp'>): void;
/** Operations enabled by the independently configured mail endpoints. */
export interface MailCapabilities {
    imap: boolean;
    smtp: boolean;
    delete: boolean;
}
/** Derive operation availability from endpoint configuration and deletion consent. */
export declare function mailCapabilities(settings: MailSettings): MailCapabilities;
/** Schemastery schema rendered as the account form by configuration surfaces. */
export declare const MailSettingsSchema: z<MailSettings>;
