/**
 * The mail account card, laid out like every other plugin card: PluginCard
 * chrome (collapsible header naming the plugin, Save/Discard footer) over the
 * shared controls for a strictly-planned parameter set:
 *
 *   account:  email account, mailbox, application password
 *   receive:  IMAP server, port, secure-connection checkbox
 *   send:     SMTP server, port, secure-connection checkbox
 */

import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { PluginCard } from './PluginCard.tsx'
import { CheckField, SecretField, ValueField } from './fields.tsx'
import type { MailCardFace, MailCardState } from './mail-card-controller.ts'

export type MailCardProps =
  PropsRuntime<'settings.plugin.item'>
  & { t: (key: string) => string }
  & InjectFace<MailCardFace>

export function MailCard(props: MailCardProps) {
  const { t } = props
  const state: MailCardState = props.useMailCard<MailCardState>((s) => s)
  const readT = t
  const disabled = !state.writable
  return (
    <PluginCard
      t={readT}
      titleKey="mailTitle"
      descriptionKey="mailDescription"
      state={state}
      onSave={props.save}
      onDiscard={props.discard}
    >
      <ValueField
        id="mail-username" label={readT('mailUsername')} hint={readT('mailUsernameHint')}
        text={state.username.text} overridden={state.username.overridden} invalid={state.username.invalid}
        overriddenLabel={readT('overridden')} resetLabel={readT('reset')} invalidLabel={readT('invalidText')}
        placeholder="you@example.com" disabled={disabled}
        onEdit={v => props.edit('username', v)} onReset={() => props.resetField('username')}
      />
      <ValueField
        id="mail-mailbox" label={readT('mailMailbox')} hint={readT('mailMailboxHint')}
        text={state.mailbox.text} overridden={state.mailbox.overridden} invalid={state.mailbox.invalid}
        overriddenLabel={readT('overridden')} resetLabel={readT('reset')} invalidLabel={readT('invalidText')}
        placeholder="INBOX" disabled={disabled}
        onEdit={v => props.edit('mailbox', v)} onReset={() => props.resetField('mailbox')}
      />
      <ValueField
        id="mail-archive-mailbox" label={readT('mailArchiveMailbox')} hint={readT('mailArchiveMailboxHint')}
        text={state.archiveMailbox.text} overridden={state.archiveMailbox.overridden} invalid={state.archiveMailbox.invalid}
        overriddenLabel={readT('overridden')} resetLabel={readT('reset')} invalidLabel={readT('invalidText')}
        placeholder="Archive" disabled={disabled}
        onEdit={v => props.edit('archiveMailbox', v)} onReset={() => props.resetField('archiveMailbox')}
      />
      <CheckField
        id="mail-allow-delete" label={readT('mailAllowDelete')} hint={readT('mailAllowDeleteHint')}
        checked={state.allowDelete.text === 'true'} disabled={disabled}
        onToggle={c => props.edit('allowDelete', c ? 'true' : 'false')}
      />
      <ValueField
        id="mail-imap-host" label={readT('mailImapHost')} hint={readT('mailImapHostHint')}
        text={state.imapHost.text} overridden={state.imapHost.overridden} invalid={state.imapHost.invalid}
        overriddenLabel={readT('overridden')} resetLabel={readT('reset')} invalidLabel={readT('invalidText')}
        disabled={disabled}
        onEdit={v => props.edit('imapHost', v)} onReset={() => props.resetField('imapHost')}
      />
      <ValueField
        id="mail-imap-port" label={readT('mailImapPort')} hint={readT('mailImapPortHint')} numeric
        text={state.imapPort.text} overridden={state.imapPort.overridden} invalid={state.imapPort.invalid}
        overriddenLabel={readT('overridden')} resetLabel={readT('reset')} invalidLabel={readT('invalidNumber')}
        disabled={disabled}
        onEdit={v => props.edit('imapPort', v)} onReset={() => props.resetField('imapPort')}
      />
      <CheckField
        id="mail-imap-secure" label={readT('mailImapSecure')} hint={readT('mailImapSecureHint')}
        checked={state.imapSecure.text === 'true'} disabled={disabled}
        onToggle={c => props.edit('imapSecure', c ? 'true' : 'false')}
      />
      <ValueField
        id="mail-smtp-host" label={readT('mailSmtpHost')} hint={readT('mailSmtpHostHint')}
        text={state.smtpHost.text} overridden={state.smtpHost.overridden} invalid={state.smtpHost.invalid}
        overriddenLabel={readT('overridden')} resetLabel={readT('reset')} invalidLabel={readT('invalidText')}
        disabled={disabled}
        onEdit={v => props.edit('smtpHost', v)} onReset={() => props.resetField('smtpHost')}
      />
      <ValueField
        id="mail-smtp-port" label={readT('mailSmtpPort')} hint={readT('mailSmtpPortHint')} numeric
        text={state.smtpPort.text} overridden={state.smtpPort.overridden} invalid={state.smtpPort.invalid}
        overriddenLabel={readT('overridden')} resetLabel={readT('reset')} invalidLabel={readT('invalidNumber')}
        disabled={disabled}
        onEdit={v => props.edit('smtpPort', v)} onReset={() => props.resetField('smtpPort')}
      />
      <CheckField
        id="mail-smtp-secure" label={readT('mailSmtpSecure')} hint={readT('mailSmtpSecureHint')}
        checked={state.smtpSecure.text === 'true'} disabled={disabled}
        onToggle={c => props.edit('smtpSecure', c ? 'true' : 'false')}
      />
      <SecretField
        id="mail-password" label={readT('mailPassword')} hint={readT('mailPasswordHint')}
        text={state.password.text} disabled={!state.passwordWritable}
        configured={state.passwordConfigured}
        stateLabel={state.passwordConfigured ? readT('mailPasswordSet') : readT('mailPasswordUnset')}
        onEdit={v => props.edit('password', v)}
      />
    </PluginCard>
  )
}
