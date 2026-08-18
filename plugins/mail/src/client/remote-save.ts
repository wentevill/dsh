import type { MailSettingsSaveResult } from '../remote-types.ts'

type MailSaveRemoteResult =
  | { readonly ok: true; readonly value: MailSettingsSaveResult }
  | { readonly ok: false; readonly error: { readonly message: string } }

/** Unwrap the Typert RemoteResult returned directly by a generated method. */
export function unwrapMailSettingsSave(response: MailSaveRemoteResult): MailSettingsSaveResult {
  if (!response.ok) throw new Error(response.error.message)
  return response.value
}
