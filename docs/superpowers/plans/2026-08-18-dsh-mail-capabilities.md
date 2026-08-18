# DSH Mail Capabilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `dsh-mail` with independently enabled IMAP/SMTP features, safe archive and approved permanent deletion, and text/HTML/workspace-attachment sending.

**Architecture:** Keep one installable Mail package but split settings, operation types, IMAP mutations, SMTP MIME construction, attachment loading, approvals, and capability-aware tool registration into focused modules. Mail owns all new contracts and continues to persist settings through its Host Remote and official `SettingsScope`; no upstream DSH source is modified.

**Tech Stack:** TypeScript 6, Cordis, DSH tools/settings/credentials/Typert, ImapFlow, Nodemailer, MailParser, html-to-text, mime-types, Vitest, pnpm packaging.

## Global Constraints

- Never modify `deepseek-harness-source`.
- Rename the package/profile dependency/tarball from `dsh-mail-plugin` to `dsh-mail`; legacy removal is out of scope.
- Empty IMAP/SMTP hosts disable their respective capabilities; default ports remain IMAP 993 and SMTP 465.
- `mail_delete` is default-off, permanently deletes only one UID, and requires fresh approval every time.
- Every send requires fresh approval.
- Attachment paths must resolve to regular files inside the calling Agent session workspace; no URL or Base64 attachment input.
- Nodemailer must retain `disableFileAccess` and `disableUrlAccess`.
- Package installation must use bundled DSH/Node/pnpm in one command.

---

### Task 1: Rename the package and establish the settings contract

**Files:**
- Modify: `plugins/mail/package.json`
- Modify: `plugins/mail/cordis.patch.yml`
- Modify: `plugins/mail/src/index.ts`
- Modify: `plugins/mail/src/client/index.ts`
- Modify: `plugins/mail/src/mail-settings.ts`
- Modify: `plugins/mail/src/client/mail-card-controller.ts`
- Modify: `plugins/mail/src/client/MailCard.tsx`
- Modify: `plugins/mail/src/client/locales.ts`
- Modify: `plugins/mail/tests/package.spec.ts`
- Create: `plugins/mail/tests/settings-capabilities.spec.ts`
- Modify: `Makefile`
- Modify: `package.json`
- Modify: `apps/desktop/tests/plugin-install.e2e.ts`

**Interfaces:**
- Produces `MailSettings` with `archiveMailbox: string` and `allowDelete: boolean`.
- Produces `mailCapabilities(settings): { imap: boolean; smtp: boolean; delete: boolean }`.
- Changes package identity to `dsh-mail` version `0.2.0` and archive `dsh-mail-0.2.0.tgz`.

- [ ] **Step 1: Write failing package and settings tests**

Add assertions equivalent to:

```ts
expect(manifest.name).toBe('dsh-mail')
expect(MailSettingsSchema({})).toMatchObject({
  archiveMailbox: 'Archive', allowDelete: false,
  imap: { host: '', port: 993, secure: true },
  smtp: { host: '', port: 465, secure: true },
})
expect(mailCapabilities(disabled)).toEqual({ imap: false, smtp: false, delete: false })
expect(mailCapabilities({ ...disabled, imap: { ...disabled.imap, host: 'imap.test' }, allowDelete: true }))
  .toEqual({ imap: true, smtp: false, delete: true })
```

- [ ] **Step 2: Run tests and verify the identity/default assertions fail**

Run: `corepack pnpm exec vitest run plugins/mail/tests/package.spec.ts plugins/mail/tests/settings-capabilities.spec.ts`

Expected: FAIL because the package is still `dsh-mail-plugin` and the new settings fields/predicate do not exist.

- [ ] **Step 3: Implement the schema, capability predicate, UI fields, and identity rename**

Use these contracts:

```ts
export interface MailCapabilities { imap: boolean; smtp: boolean; delete: boolean }
export function mailCapabilities(settings: MailSettings): MailCapabilities {
  const imap = settings.imap.host.trim() !== ''
  return { imap, smtp: settings.smtp.host.trim() !== '', delete: imap && settings.allowDelete }
}
```

Add `archiveMailbox` and `allowDelete` to Host config, Remote settings, client controller drafts, status copy, and `cordis.patch.yml`. Set both example hosts to `""`. Rename Host/Client names to `mail`/`mail-client`, Cordis id/name to `mail`/`dsh-mail`, and update Make/package/E2E archive paths.

- [ ] **Step 4: Rebuild generated artifacts and run focused tests**

Run: `npm --prefix plugins/mail run build`

Run: `corepack pnpm exec vitest run plugins/mail/tests/package.spec.ts plugins/mail/tests/settings-capabilities.spec.ts plugins/mail/tests/settings-save.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the settings and identity slice**

```bash
git add Makefile package.json apps/desktop/tests/plugin-install.e2e.ts plugins/mail
git commit -m "feat(mail): rename package and define capabilities"
```

### Task 2: Move Mail operation contracts into the package and split IMAP transport

**Files:**
- Create: `plugins/mail/src/mail-types.ts`
- Create: `plugins/mail/src/imap-transport.ts`
- Modify: `plugins/mail/src/transport.ts`
- Modify: `plugins/mail/src/index.ts`
- Create: `plugins/mail/tests/imap-transport.spec.ts`
- Modify: `plugins/mail/tests/transport.spec.ts`
- Modify: `plugins/mail/package.json`

**Interfaces:**
- Produces `MailImapTransport.list/read/archive/delete`.
- Produces `MailArchiveRequest/Result` and `MailDeleteRequest/Result` with UID ids.
- Keeps `NodeMailTransport` as a compatibility facade only if existing tests/exports require it; new code consumes the narrower interfaces.

- [ ] **Step 1: Write failing IMAP mutation tests**

Use an injected ImapFlow-like factory and assert:

```ts
await transport.archive(config, password, { id: '42' })
expect(client.messageMove).toHaveBeenCalledWith('42', 'Archive', { uid: true })

await transport.delete(config, password, { id: '42' })
expect(client.messageDelete).toHaveBeenCalledWith('42', { uid: true })
```

Also test missing archive mailbox and a provider without safe UID-targeted deletion. The latter must reject and must not call any mailbox-wide expunge method.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `corepack pnpm exec vitest run plugins/mail/tests/imap-transport.spec.ts`

Expected: FAIL because archive/delete contracts and transport methods do not exist.

- [ ] **Step 3: Define Mail-owned operation types**

Define exact shapes:

```ts
export interface MailArchiveRequest { id: string }
export interface MailArchiveResult { id: string; mailbox: string; destinationId?: string }
export interface MailDeleteRequest { id: string }
export interface MailDeleteResult { id: string; deleted: true }
export interface MailMessageIdentity { id: string; subject: string; from: MailAddress[] }
```

Move the list/read/send request/result imports used by this package behind `mail-types.ts` aliases or Mail-owned definitions so new functionality never requires an upstream edit.

- [ ] **Step 4: Implement the IMAP transport with one connection helper**

List/read use read-only mailbox locks. Archive/delete use writable locks. Validate UID strings before contacting the provider. Archive first verifies the configured destination mailbox, then performs UID move. Delete uses ImapFlow `messageDelete(id, { uid: true })`, which performs the targeted `\\Deleted` plus UID-expunge path, and throws a stable unsupported-provider error before mutation when that safe path is unavailable.

- [ ] **Step 5: Run IMAP and existing transport tests**

Run: `corepack pnpm exec vitest run plugins/mail/tests/imap-transport.spec.ts plugins/mail/tests/transport.spec.ts`

Expected: PASS with no mailbox-wide expunge call.

- [ ] **Step 6: Commit the IMAP transport slice**

```bash
git add plugins/mail/src/mail-types.ts plugins/mail/src/imap-transport.ts plugins/mail/src/transport.ts plugins/mail/src/index.ts plugins/mail/tests plugins/mail/package.json
git commit -m "feat(mail): add archive and permanent delete transport"
```

### Task 3: Add workspace-confined attachment loading

**Files:**
- Create: `plugins/mail/src/attachment-loader.ts`
- Create: `plugins/mail/tests/attachment-loader.spec.ts`
- Modify: `plugins/mail/src/mail-types.ts`
- Modify: `plugins/mail/package.json`

**Interfaces:**
- Produces `loadAttachments(requests, workspace, limits, signal): Promise<LoadedMailAttachment[]>`.
- `LoadedMailAttachment` contains only `{ filename, contentType, content: Buffer, size }`; SMTP never receives a filesystem path.

- [ ] **Step 1: Write failing security tests**

Create real temporary workspace fixtures and cover: relative success, absolute in-workspace success, `..` escape, symlink escape, missing workspace, directory, FIFO when supported, CR/LF filename, more than 10 files, file over 10 MiB, and total over 25 MiB.

```ts
await expect(loadAttachments([{ path: '../outside.txt' }], workspace, DEFAULT_ATTACHMENT_LIMITS, signal))
  .rejects.toMatchObject({ code: 'MAIL_ATTACHMENT_OUTSIDE_WORKSPACE' })
```

- [ ] **Step 2: Run and verify the attachment tests fail**

Run: `corepack pnpm exec vitest run plugins/mail/tests/attachment-loader.spec.ts`

Expected: FAIL because the loader is absent.

- [ ] **Step 3: Implement canonical containment and all-or-nothing loading**

Use `realpath`, `stat`, and `readFile`; compare canonical paths with `relative(canonicalWorkspace, canonicalTarget)` and reject results beginning with `..` or absolute results. Check all metadata and cumulative sizes before reading contents. Infer MIME through direct dependency `mime-types`, falling back to `application/octet-stream`.

- [ ] **Step 4: Run focused tests**

Run: `corepack pnpm exec vitest run plugins/mail/tests/attachment-loader.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit the attachment boundary**

```bash
git add plugins/mail/src/attachment-loader.ts plugins/mail/src/mail-types.ts plugins/mail/tests/attachment-loader.spec.ts plugins/mail/package.json
git commit -m "feat(mail): confine outgoing attachments to workspace"
```

### Task 4: Implement rich SMTP MIME sending

**Files:**
- Create: `plugins/mail/src/html.ts`
- Create: `plugins/mail/src/smtp-transport.ts`
- Create: `plugins/mail/tests/smtp-transport.spec.ts`
- Modify: `plugins/mail/src/mail-types.ts`
- Modify: `plugins/mail/src/transport.ts`
- Modify: `plugins/mail/package.json`

**Interfaces:**
- Produces `normalizeBodies({ text?, html? }): { text: string; html?: string }`.
- Produces `MailSmtpTransport.send(config, password, request, signal)` consuming only loaded Buffer attachments.

- [ ] **Step 1: Write failing body and MIME tests**

Cover no body rejection, text-only, HTML-only fallback, text+HTML preservation, Bcc delivery, multiple Buffer attachments, CR/LF rejection, and `disableFileAccess`/`disableUrlAccess`.

```ts
expect(normalizeBodies({ html: '<h1>Hello</h1><p>World</p>' })).toEqual({
  html: '<h1>Hello</h1><p>World</p>', text: 'Hello\n\nWorld',
})
```

- [ ] **Step 2: Run and verify failure**

Run: `corepack pnpm exec vitest run plugins/mail/tests/smtp-transport.spec.ts`

Expected: FAIL because rich send modules do not exist.

- [ ] **Step 3: Implement normalization and SMTP send**

Add direct `html-to-text` dependency. Validate text <= 500,000 and HTML <= 1,000,000 characters. Pass `to`, `cc`, `bcc`, `subject`, normalized bodies, and attachment Buffers to Nodemailer. Results contain only the provider message id.

- [ ] **Step 4: Run SMTP tests**

Run: `corepack pnpm exec vitest run plugins/mail/tests/smtp-transport.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit rich sending**

```bash
git add plugins/mail/src/html.ts plugins/mail/src/smtp-transport.ts plugins/mail/src/mail-types.ts plugins/mail/src/transport.ts plugins/mail/tests/smtp-transport.spec.ts plugins/mail/package.json
git commit -m "feat(mail): send html and workspace attachments"
```

### Task 5: Add capability-aware tools and approval policy

**Files:**
- Create: `plugins/mail/src/approval.ts`
- Create: `plugins/mail/src/tools.ts`
- Modify: `plugins/mail/src/index.ts`
- Create: `plugins/mail/tests/tools-capabilities.spec.ts`
- Create: `plugins/mail/tests/approval.spec.ts`
- Modify: `plugins/mail/tests/mail.spec.ts`

**Interfaces:**
- Produces `MailCapabilityManager` that watches settings and owns capability tool fibers.
- Produces approval summaries for `mail_send` and `mail_delete`.
- Consumes session cwd from `exec.agent?.session.header.cwd` for attachments.

- [ ] **Step 1: Write failing tool-catalog tests**

Assert the exact matrix:

```ts
expect(toolNames(disabled)).toEqual([])
expect(toolNames(imapOnly)).toEqual(['mail_archive', 'mail_list', 'mail_read'])
expect(toolNames({ ...imapOnly, allowDelete: true })).toEqual(['mail_archive', 'mail_delete', 'mail_list', 'mail_read'])
expect(toolNames(smtpOnly)).toEqual(['mail_send'])
```

Simulate a settings change and assert old fibers dispose before replacement. Capture a delete call, approve it, disable deletion, and assert transport mutation is never called.

- [ ] **Step 2: Write failing approval tests**

Assert every send and delete returns `{ kind: 'ask' }`; list/read/archive delegate to `next()`. Delete approval contains UID, subject, and sender, while send approval contains recipients, formats, attachment basenames, and byte total but no body or Bcc in ordinary logs.

- [ ] **Step 3: Run and verify failures**

Run: `corepack pnpm exec vitest run plugins/mail/tests/tools-capabilities.spec.ts plugins/mail/tests/approval.spec.ts`

Expected: FAIL because manager/tools/approval modules do not exist.

- [ ] **Step 4: Implement capability fibers and operations**

Register tools in three groups: IMAP read/archive, delete, and SMTP send. Watch the Host `SettingsScope`; on changes, compute predicates and replace only changed fibers. Each execute handler captures one resolved config, validates feature state, resolves the credential, and calls the narrow transport. `mail_send` loads all attachments before approval-visible execution metadata is finalized. `mail_delete` fetches identity for approval and rechecks current `allowDelete` immediately before mutation.

- [ ] **Step 5: Run tool, approval, and legacy Mail tests**

Run: `corepack pnpm exec vitest run plugins/mail/tests/tools-capabilities.spec.ts plugins/mail/tests/approval.spec.ts plugins/mail/tests/mail.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit tool behavior**

```bash
git add plugins/mail/src/approval.ts plugins/mail/src/tools.ts plugins/mail/src/index.ts plugins/mail/tests
git commit -m "feat(mail): expose capability-aware mail tools"
```

### Task 6: Complete Client settings and live status UX

**Files:**
- Modify: `plugins/mail/src/client/mail-card-controller.ts`
- Modify: `plugins/mail/src/client/MailCard.tsx`
- Modify: `plugins/mail/src/client/locales.ts`
- Modify: `plugins/mail/src/client/card-types.ts`
- Modify: `plugins/mail/tests/settings-save.spec.ts`
- Create: `plugins/mail/tests/client-capability-status.spec.ts`

**Interfaces:**
- Adds editable Archive mailbox and Allow permanent delete fields.
- Adds derived receive/send/delete status to `MailCardState`.

- [ ] **Step 1: Write failing controller projection tests**

Assert empty hosts show disabled, adding an IMAP host enables receive, adding SMTP enables send, and delete requires both IMAP and `allowDelete`. Assert the complete Remote save payload includes `archiveMailbox` and `allowDelete` while ports retain defaults.

- [ ] **Step 2: Run and verify failure**

Run: `corepack pnpm exec vitest run plugins/mail/tests/client-capability-status.spec.ts plugins/mail/tests/settings-save.spec.ts`

Expected: FAIL on missing fields/status.

- [ ] **Step 3: Implement fields, status copy, and save projection**

Do not expose `passwordEnv` as a raw secret field. Preserve the credentials-domain password control. Empty host values are valid and mean disabled; ports must remain integers from 1 to 65535. Add explicit destructive wording beside `allowDelete`.

- [ ] **Step 4: Build and run Client tests**

Run: `npm --prefix plugins/mail run build`

Run: `corepack pnpm exec vitest run plugins/mail/tests/client-capability-status.spec.ts plugins/mail/tests/settings-save.spec.ts plugins/mail/tests/client-inject.spec.ts plugins/mail/tests/client-settings-mirror.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit Client UX**

```bash
git add plugins/mail/src/client plugins/mail/lib plugins/mail/tests
git commit -m "feat(mail): show live mail capability settings"
```

### Task 7: Package, install, boot, and Web acceptance

**Files:**
- Modify: `plugins/mail/README.md`
- Modify: `plugins/mail/tests/package.spec.ts`
- Modify: `apps/desktop/tests/plugin-install.e2e.ts`
- Modify: `Makefile`

**Interfaces:**
- Produces `plugins/mail/dsh-mail-0.2.0.tgz`.
- `make pack-plugin` and `make install-plugin` use the renamed archive and bundled Desktop runtime only.

- [ ] **Step 1: Extend release-shaped tests**

Assert the tgz contains every runtime dependency and generated Host/Client/Typert artifact, the installed profile dependency and bundle are exactly `dsh-mail`, Host Web boots, the Client loader activates, and `mailSettings/load` returns empty-host defaults with ports 993/465.

- [ ] **Step 2: Run full Mail verification**

Run: `npm --prefix plugins/mail run build`

Run: `corepack pnpm exec vitest run plugins/mail/tests`

Expected: all Mail tests pass.

- [ ] **Step 3: Pack and run one-command installation E2E**

Run: `corepack pnpm mail:pack`

Run: `corepack pnpm --dir apps/desktop test:plugin-install`

Expected: one tgz installs into a fresh profile and Web boot succeeds without host Node/npm/pnpm.

- [ ] **Step 4: Install into the actual Desktop profile and test Web directly**

Run: `make install-plugin`

Start the bundled DSH Web profile, call `mailSettings/load`, verify default/status echo, save a non-secret configuration, reload it, and confirm the loader reports zero failed entries. Do not write a real password during automated acceptance.

- [ ] **Step 5: Verify repository boundaries**

Run: `git diff --check`

Run: `git -C deepseek-harness-source status --short`

Expected: no whitespace errors and empty upstream status. Root `design.md` remains untouched.

- [ ] **Step 6: Commit release acceptance updates**

```bash
git add Makefile apps/desktop/tests/plugin-install.e2e.ts plugins/mail/README.md plugins/mail/tests/package.spec.ts
git commit -m "test(mail): verify renamed production package"
```

### Task 8: Final regression and review

**Files:**
- Review only: all files changed by Tasks 1-7

**Interfaces:**
- No new interface; this task proves the complete design contract.

- [ ] **Step 1: Run the complete relevant suite from a clean process state**

Run: `npm --prefix plugins/mail run build`

Run: `corepack pnpm exec vitest run plugins/mail/tests`

Run: `corepack pnpm --dir apps/desktop test:plugin-install`

Expected: zero failures.

- [ ] **Step 2: Audit destructive and file boundaries manually**

Confirm source shows: delete tool default-off; every delete hits approval; delete rechecks the live flag; no mailbox-wide expunge fallback; attachments are canonicalized inside session cwd; Nodemailer receives only Buffers; URL/file access stays disabled; Bcc/body/credentials are absent from result/log prose.

- [ ] **Step 3: Audit packaging and immutable upstream**

Run: `tar -tf plugins/mail/dsh-mail-0.2.0.tgz`

Run: `git -C deepseek-harness-source status --short`

Run: `git status --short`

Expected: complete package, empty upstream status, and only the user's pre-existing `design.md` outside committed work.

- [ ] **Step 4: Request code review and address only verified findings**

Use the requesting-code-review workflow against the full Task 1-7 diff. Re-run the failing test before any review-driven fix, then repeat the complete relevant suite.

- [ ] **Step 5: Record final release commit if review required changes**

```bash
git add plugins/mail Makefile package.json apps/desktop/tests/plugin-install.e2e.ts
git commit -m "fix(mail): address capability review findings"
```
