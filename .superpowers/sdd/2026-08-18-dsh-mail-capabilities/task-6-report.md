# Task 6 report — Client settings and live capability status

Completed the Mail Client capability-settings slice without replacing the Task 1 UI work.

Fix round 1: credential write rejections and throws now retain the password draft and show a failed save. A submitted draft snapshot prevents a pending save from clearing edits made afterward.

Fix round 2: settings and credential writes now settle as independent ordered stages. Successful settings drafts retire even when the credential write fails, a password-only retry skips the Mail Remote, and a failed Mail Remote prevents the credential write. Each draft mutation carries a generation, so an equal-text concurrent edit cannot be retired by an older completion. A reset during a pending save carries its confirmed pre-submit value as an explicit reset intent; it remains dirty if the server lands a different value and retires if the server still matches it.

Credential badge reads now use a monotonic request generation: only the latest-started describe may publish. The post-write describe supersedes initial and invalidation reads, and controller disposal invalidates outstanding requests and unsubscribes from the settings scope.

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
- Fix round 2 focused suite: `corepack pnpm exec vitest run plugins/mail/tests/settings-save.spec.ts plugins/mail/tests/client-capability-status.spec.ts plugins/mail/tests/client-inject.spec.ts plugins/mail/tests/client-settings-mirror.spec.ts` — 10 project-file runs, 33 tests passed.
- Fix round 2 full suite: `corepack pnpm exec vitest run plugins/mail/tests --exclude '.worktrees/**' --exclude '.pnpm-store/**'` — 15 files, 134 tests passed.
- `corepack pnpm exec tsc --noEmit -p plugins/mail/tsconfig.build.json`
- `corepack pnpm exec tsc --noEmit -p packages/mail/mail/tsconfig.json`
- `git diff --check`
- `git -C deepseek-harness-source status --short`

The explicit excludes are required because the shared checkout contains unrelated `.worktrees` and `.pnpm-store` copies that Vitest otherwise discovers; those copies do not have generated artifacts or installed dependencies.
