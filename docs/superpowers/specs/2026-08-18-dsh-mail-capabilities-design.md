# DSH Mail Capabilities Design

## Goal

Turn the current Mail plugin into the `dsh-mail` package with independently enabled IMAP and SMTP capabilities, safe archive and permanent-delete operations, and rich text/HTML/attachment sending. Only Mail-owned code may change; `deepseek-harness-source` remains immutable.

## Identity

- npm package and profile dependency: `dsh-mail`
- archive: `dsh-mail-<version>.tgz`
- Cordis entry: `id: mail`, `name: dsh-mail`
- Host plugin name: `mail`
- Client plugin name: `mail-client`
- settings namespace: `mail`
- tool prefix: `mail_`

Migration/removal of an already installed `dsh-mail-plugin` package is outside this feature's scope.

## Configuration and capability state

```yaml
mail:
  username: user@example.com
  passwordEnv: MAIL_APP_PASSWORD
  mailbox: INBOX
  archiveMailbox: Archive
  allowDelete: false
  imap:
    host: ""
    port: 993
    secure: true
  smtp:
    host: ""
    port: 465
    secure: true
```

- A non-empty `imap.host` enables list, read, archive, and the IMAP account path.
- A non-empty `smtp.host` enables send independently of IMAP.
- `mail_delete` is available only when IMAP is enabled and `allowDelete` is true.
- Empty hosts are the disabled defaults. Example domains must never act as enabled defaults.
- Missing ports resolve to IMAP 993 and SMTP 465.
- The settings page displays receive, send, and permanent-delete status.
- Missing username or credential produces a precise execution error without requiring restart after correction.
- Settings changes apply live. Each operation uses a configuration snapshot captured when that operation begins.

## Architecture

Use one package with three bounded capability areas: IMAP reads, IMAP mutations, and SMTP sends. Mail owns all new public types rather than changing `@deepseek-ai/dsh-mail` or any other upstream package.

Responsibilities:

- `mail-settings.ts`: schema, defaults, and capability predicates.
- `mail-types.ts`: Mail-owned list/read/archive/delete/send request and result types.
- `imap-transport.ts`: list, read, archive, and permanent delete by UID.
- `smtp-transport.ts`: MIME send with text, HTML, and in-memory attachments.
- `attachment-loader.ts`: workspace containment, canonicalization, type, count, and size checks.
- `html.ts`: HTML-to-text fallback.
- `approval.ts`: stable send and delete approval summaries.
- `tools.ts`: capability-aware tool registration and execution.
- Existing Mail settings Remote: Host-backed settings load and save for the Client.

Tool availability follows live settings. Capability tool fibers are registered or disposed when their enabling predicates change. A pending permanent-delete call rechecks `allowDelete` immediately before mutation so an approval cannot race a later disable.

## Tools

### Read operations

- `mail_list(limit?, cursor?)` returns bounded recent message summaries with opaque UID-based ids.
- `mail_read(id)` returns text, headers, and attachment metadata. It does not automatically return attachment contents.

### Archive

- `mail_archive(id)` moves one UID to `archiveMailbox`, default `Archive`.
- The destination mailbox must already exist; Mail does not create it.
- The result reports the original UID, destination mailbox, and destination UID when supplied by the server.

### Permanent delete

- `mail_delete(id)` exists only with IMAP enabled and `allowDelete: true`.
- Every call requires fresh DSH approval. The approval includes UID, subject, and sender obtained by a read-only summary fetch.
- After approval, Mail marks only that UID `\Deleted` and performs UID-targeted expunge.
- If the provider cannot safely expunge one UID, Mail refuses the operation. It never expunges the entire mailbox.

### Send

```ts
mail_send({
  to: string[],
  cc?: string[],
  bcc?: string[],
  subject: string,
  text?: string,
  html?: string,
  attachments?: Array<{
    path: string,
    filename?: string,
    contentType?: string,
  }>,
})
```

- Every send requires fresh DSH approval.
- The approval identifies To/Cc/Bcc, subject, body formats, attachment names, and total attachment size.
- Bcc is accepted for delivery but omitted from ordinary results and log prose.
- `text` or `html` must be present. HTML-only input receives a generated plain-text fallback.
- Subject and address validation rejects CR/LF injection.
- Defaults: maximum 100 recipients, 500,000 text characters, and 1,000,000 HTML characters. Existing configurable recipient/body bounds remain supported where applicable.

## Attachment security

- Relative paths resolve against the calling Agent session's `agent.session.header.cwd`.
- An attachment call without an Agent workspace is rejected.
- Workspace and target are canonicalized with real filesystem paths; `..` and symlink escapes are rejected.
- Only regular files are accepted. Directories, devices, FIFOs, and sockets are rejected.
- Every attachment is validated and loaded before SMTP begins, so validation failure sends nothing.
- Nodemailer receives Buffers, never local paths. `disableFileAccess` and `disableUrlAccess` remain enabled.
- Defaults: at most 10 attachments, 10 MiB per file, and 25 MiB total.
- A default filename is the source basename. Overrides must be basename-only and contain no CR/LF.
- An unspecified content type is inferred from the extension or becomes `application/octet-stream`.
- HTML is passed as a string. Mail never fetches HTML URLs, remote images, or file references.

## Error model

Stable Mail error codes include:

- `MAIL_IMAP_DISABLED`
- `MAIL_SMTP_DISABLED`
- `MAIL_DELETE_DISABLED`
- `MAIL_ARCHIVE_MAILBOX_UNAVAILABLE`
- `MAIL_ATTACHMENT_OUTSIDE_WORKSPACE`
- `MAIL_ATTACHMENT_TOO_LARGE`
- `MAIL_MESSAGE_UNAVAILABLE`
- `MAIL_CREDENTIAL_UNAVAILABLE`
- `MAIL_PROVIDER_FAILURE`

Provider errors are wrapped without leaking credentials or message bodies. Validation and capability errors remain distinguishable from provider failures.

## Verification

- Schema tests cover empty-host defaults, default ports, archive mailbox, delete default-off, and independent IMAP/SMTP predicates.
- Tool tests cover live availability, configuration snapshots, and deletion recheck after approval.
- IMAP tests cover UID list/read, move, missing archive mailbox, UID-targeted deletion, and refusal when safe targeted expunge is unavailable.
- Approval tests prove every send and every delete asks, while list/read/archive do not.
- MIME tests cover To/Cc/Bcc, text, HTML fallback, HTML plus text, and multiple attachments.
- Attachment tests cover missing workspace, traversal, symlink escape, non-regular files, filename injection, count, per-file size, total size, and all-or-nothing loading.
- Packaging tests prove `dsh-mail` tgz contents, one-command DSH installation, Host boot, Client loader activation, and settings echo.
- `git -C deepseek-harness-source status --short` must remain empty.

## Out of scope

- Downloading attachment contents from received messages.
- Creating the archive mailbox automatically.
- Moving deleted messages to Trash.
- Fetching external resources referenced by HTML.
- Modifying DSH settings allowlists or any upstream DSH source.
- Automatically removing the legacy package name from existing profiles.
