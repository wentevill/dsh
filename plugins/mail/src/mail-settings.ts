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

import z from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** The user-settings namespace owning this plugin's account form. */
export const MAIL_SETTINGS_NAMESPACE = settingsNamespace('mail')

/** SMTP/IMAP endpoint shared shape. */
export interface NetworkEndpoint {
  host: string
  port: number
  /** Secure connection on connect (implicit TLS). */
  secure: boolean
}

/** The account fields a user configures in the page. No secrets here. */
export interface MailSettings {
  /** Account whose mailbox is read and on whose behalf mail is sent. */
  username: string
  /** CredentialRef naming the password held in key management. */
  passwordEnv: string
  /** IMAP mailbox to list/read. */
  mailbox: string
  /** IMAP mailbox where archived messages are moved. */
  archiveMailbox: string
  /** Whether permanently deleting a message is available. */
  allowDelete: boolean
  /** IMAP receive endpoint. */
  imap: NetworkEndpoint
  /** SMTP send endpoint. */
  smtp: NetworkEndpoint
}

/** Operations enabled by the independently configured mail endpoints. */
export interface MailCapabilities {
  imap: boolean
  smtp: boolean
  delete: boolean
}

/** Derive operation availability from endpoint configuration and deletion consent. */
export function mailCapabilities(settings: MailSettings): MailCapabilities {
  const imap = settings.imap.host.trim() !== ''
  return { imap, smtp: settings.smtp.host.trim() !== '', delete: imap && settings.allowDelete }
}

/** Endpoint schema for a given default port (`imap` 993, `smtp` 465). */
function endpoint(portDefault: number): z<NetworkEndpoint> {
  return z.object({
    host: z.string().default(''),
    port: z.number().step(1).min(1).max(65535).default(portDefault),
    secure: z.boolean().default(true),
  })
}

/** Schemastery schema rendered as the account form by configuration surfaces. */
export const MailSettingsSchema: z<MailSettings> = z.object({
  username: z.string().default(''),
  passwordEnv: z.string().role('credential-ref').default('MAIL_APP_PASSWORD'),
  mailbox: z.string().default('INBOX'),
  archiveMailbox: z.string().default('Archive'),
  allowDelete: z.boolean().default(false),
  imap: endpoint(993),
  smtp: endpoint(465),
})
