# Task 6 report — Client settings and live capability status

Completed the Mail Client capability-settings slice without replacing the Task 1 UI work.

- Added controller coverage for independent receive/send/permanent-delete status from current settings and staged drafts.
- A complete save projection now preserves unedited `mailbox` and `archiveMailbox` values, keeps `allowDelete`, and defaults omitted or blank port values to IMAP 993 and SMTP 465.
- Invalid port drafts (`1..65535` integers only) are rejected before any Remote save.
- Kept the password write-only through the credentials domain; no raw credential control was added.
- Strengthened the English and Chinese permanent-delete warning to state that deletion is irreversible.
- Rebuilt `plugins/mail/lib/client.js`. Restored unrelated Typert generated `sourceLocation` line-number churn.

Verification:

- `npm --prefix plugins/mail run build`
- `corepack pnpm exec vitest run plugins/mail/tests/client-capability-status.spec.ts plugins/mail/tests/settings-save.spec.ts plugins/mail/tests/client-inject.spec.ts plugins/mail/tests/client-settings-mirror.spec.ts`
- `corepack pnpm exec vitest run plugins/mail/tests --exclude '.worktrees/**' --exclude '.pnpm-store/**'` — 15 files, 122 tests passed.
- `git diff --check`
- `git -C deepseek-harness-source status --short`

The explicit excludes are required because the shared checkout contains unrelated `.worktrees` and `.pnpm-store` copies that Vitest otherwise discovers; those copies do not have generated artifacts or installed dependencies.
