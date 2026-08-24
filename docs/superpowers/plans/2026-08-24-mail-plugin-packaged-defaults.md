# Mail Plugin Packaged Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the repository-owned mail defaults in the production archive, apply them on first install, and prove reinstall does not overwrite saved user settings.

**Architecture:** Keep `plugins/mail/cordis.patch.yml` as the single source of installation defaults and continue delegating installation to `dsh plugin add`. Strengthen the generic release audit so a manifest-declared bundle patch must exist in the archive, then extend package and staged-runtime tests to lock down the mail-specific defaults and preservation lifecycle.

**Tech Stack:** Node.js 24 ESM, TypeScript 6, Vitest, pnpm, DSH CLI bundle patches, Cordis YAML composition.

## Global Constraints

- `plugins/mail/cordis.patch.yml` is the canonical packaged default configuration.
- Packaged defaults are seed values and must not overwrite settings already owned by the user's profile.
- Defaults contain only non-secret settings; `passwordEnv` is a credential reference, never a credential value.
- Configured IMAP and SMTP endpoints require TLS.
- Installation remains delegated to `dsh plugin --profile <profile> add <mail-archive>` with no post-install settings writer or startup repair.
- Do not add per-build flags, environment substitution, organization policy, secret provisioning, another defaults file, or changes to explicit UI reset behavior.

## File Structure

- Modify `plugins/mail/scripts/release-audit.mjs`: validate that a root manifest's declared `dsh.bundle.patch` is a safe relative file present in the archive.
- Modify `plugins/mail/tests/package.spec.ts`: cover missing/unsafe bundle patches and assert the mail patch carries the complete non-secret, TLS-only default configuration.
- Modify `apps/desktop/tests/plugin-install.e2e.ts`: add real remote save support to the staged Web probe and verify saved settings survive remove-and-reinstall.

---

### Task 1: Audit and lock down packaged defaults

**Files:**
- Modify: `plugins/mail/scripts/release-audit.mjs`
- Test: `plugins/mail/tests/package.spec.ts`

**Interfaces:**
- Consumes: root package manifest field `dsh.bundle.patch: string` and archive entries shaped as `{ path, type, content? }`.
- Produces: `auditPackageEntries(entries): { productionPackages: string[] }`, now rejecting a declared patch that is unsafe, absent, or not a regular file. The return type remains unchanged.

- [ ] **Step 1: Write failing bundle-patch audit tests**

Extend the `auditPackageEntries` fixture in `plugins/mail/tests/package.spec.ts` so its root manifest can declare a patch and its entries can include that patch. Add focused cases equivalent to:

```ts
const rootManifest = {
  name: 'fixture',
  version: '1.0.0',
  dependencies: { runtime: '1.0.0' },
  dsh: { bundle: { patch: './cordis.patch.yml' } },
}

expect(() => auditPackageEntries(entries())).toThrow(/declared bundle patch.*missing/u)
expect(() => auditPackageEntries(entries(undefined, '../escape.yml'))).toThrow(/unsafe bundle patch/u)
expect(auditPackageEntries([
  ...entries(undefined, './cordis.patch.yml'),
  { path: 'package/cordis.patch.yml', type: 'file' as const, content: Buffer.from('- insert: []\n') },
])).toEqual({ productionPackages: ['runtime'] })
```

Keep the existing dependency-closure assertions intact; adjust the local fixture helper signature rather than duplicating the full manifest setup.

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run:

```bash
corepack pnpm --dir plugins/mail exec vitest run tests/package.spec.ts
```

Expected: the missing and unsafe patch cases fail because `auditPackageEntries` does not yet inspect `dsh.bundle.patch`.

- [ ] **Step 3: Implement minimal manifest-to-archive patch validation**

In `auditPackageEntries`, after loading `package/package.json`, read `rootManifest.dsh?.bundle?.patch`. When it is present:

```js
const patch = rootManifest.dsh?.bundle?.patch
if (typeof patch !== 'string' || !patch.startsWith('./')) {
  throw new Error('package audit: unsafe bundle patch declaration')
}
const patchPath = posix.join('package', patch.slice(2))
if (!safeArchivePath(patchPath)) {
  throw new Error(`package audit: unsafe bundle patch ${String(patch)}`)
}
const patchEntry = entries.find(entry => entry.path === patchPath)
if (patchEntry === undefined || patchEntry.type !== 'file') {
  throw new Error(`package audit: declared bundle patch is missing: ${patchPath}`)
}
```

Reject empty paths, absolute paths, parent traversal, and non-file entries. Do not parse or execute patch contents in the generic archive auditor.

- [ ] **Step 4: Add mail-specific default contract assertions**

Replace the narrow `secure` string test with one test that reads `plugins/mail/cordis.patch.yml` and asserts all repository defaults are represented:

```ts
expect(patch).toContain('name: dsh-mail')
expect(patch).toContain('username: you@example.com')
expect(patch).toContain('passwordEnv: MAIL_APP_PASSWORD')
expect(patch).toContain('mailbox: INBOX')
expect(patch).toContain('archiveMailbox: Archive')
expect(patch).toContain('allowDelete: false')
expect(patch).toContain('port: 993')
expect(patch).toContain('port: 465')
expect(patch.match(/secure: true/gu)).toHaveLength(2)
expect(patch).not.toMatch(/password\s*:/iu)
expect(patch).not.toContain('tls: implicit')
```

Also keep the production-archive entry assertion for `package/cordis.patch.yml`; it exercises the new auditor through `auditPackageArchive`.

- [ ] **Step 5: Run package tests and static checks**

Run:

```bash
corepack pnpm --dir plugins/mail exec vitest run tests/package.spec.ts
corepack pnpm --dir plugins/mail exec tsc -p tsconfig.json --noEmit
```

Expected: both commands pass. The package test proves that a release with a missing declared patch is rejected and the current mail patch matches the non-secret TLS-only default contract.

- [ ] **Step 6: Commit the package audit**

```bash
git add plugins/mail/scripts/release-audit.mjs plugins/mail/tests/package.spec.ts
git commit -m "test(mail): enforce packaged default configuration"
```

### Task 2: Prove first-install seeding and reinstall preservation

**Files:**
- Modify: `apps/desktop/tests/plugin-install.e2e.ts`

**Interfaces:**
- Consumes: the real `/api/mailSettings/load` and `/api/mailSettings/save` remote endpoints exposed after `bootWeb` starts the staged runtime.
- Produces: a reusable `requestMailSettings(origin, method, args)` probe and a lifecycle assertion that first-install defaults are immediate while saved settings survive remove-and-reinstall.

- [ ] **Step 1: Write a failing settings preservation lifecycle**

Introduce a shared request helper used by both load and save:

```ts
async function requestMailSettings(origin: string, method: 'load' | 'save', args: unknown): Promise<unknown> {
  const rpcId = `mail-settings-${method}-e2e`
  const response = await fetch(new URL(`/api/mailSettings/${method}`, origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: `mailSettings/${method}`,
      payload: { args },
    }),
  })
  if (!response.ok) throw new Error(`mailSettings/${method} returned HTTP ${response.status}`)
  const envelope = await response.json() as {
    rpcId?: string
    result?: { ok?: boolean; value?: unknown; error?: unknown }
  }
  if (envelope.rpcId !== rpcId || envelope.result?.ok !== true) {
    throw new Error(`mailSettings/${method} failed: ${JSON.stringify(envelope)}`)
  }
  return envelope.result.value
}
```

Change `inspectWeb` to accept an optional non-secret settings value. After loading first-install defaults, call `save` with this distinct value before terminating the Web child:

```ts
const savedSettings = {
  username: 'saved@example.com',
  passwordEnv: 'MAIL_APP_PASSWORD',
  mailbox: 'Saved Inbox',
  archiveMailbox: 'Saved Archive',
  allowDelete: true,
  imap: { host: 'imap.saved.example.com', port: 1993, secure: true },
  smtp: { host: 'smtp.saved.example.com', port: 1465, secure: true },
}
```

Return both the initial load and save result from the first boot. Then remove and reinstall `dsh-mail`, boot a second time, and assert its loaded settings equal `savedSettings` exactly.

- [ ] **Step 2: Run the staged installation test before changing preservation behavior**

Run:

```bash
npm --prefix apps/desktop run test:plugin-install
```

Expected: either PASS, proving the existing upstream insert reconciliation already preserves user settings, or FAIL with the second boot returning packaged defaults. Treat any unrelated runtime/package failure as a test-environment issue and diagnose it before changing product code.

- [ ] **Step 3: Keep the narrowest implementation supported by the result**

If the test passes, make no installer or settings-store change: the existing bundle insert is the implementation and this E2E is its regression contract.

If the test shows overwrite, inspect the installed profile composition and upstream CLI behavior captured by the failing fixture. Add a first-install guard only at the mail release installer boundary, before invoking `plugin add`, using an existing profile-owned mail configuration as the guard. The guard must not parse credential values, create another settings file, or suppress installation of the package itself. Add a focused test for the exact guard before implementing it; do not modify upstream runtime sources.

- [ ] **Step 4: Run the full mail and Desktop verification suite**

Run:

```bash
corepack pnpm --dir plugins/mail test
corepack pnpm --dir plugins/mail run build
npm --prefix apps/desktop test
npm --prefix apps/desktop run test:plugin-install
git diff --check
```

Expected: every command passes. The staged E2E proves the archive installs once, defaults are readable on first boot, a real remote save is durable, and remove-and-reinstall preserves that value.

- [ ] **Step 5: Commit lifecycle verification**

```bash
git add apps/desktop/tests/plugin-install.e2e.ts
git commit -m "test(mail): preserve settings across reinstall"
```

### Task 3: Final release-boundary verification

**Files:**
- Verify only: `plugins/mail/cordis.patch.yml`
- Verify only: `plugins/mail/package.json`
- Verify only: `plugins/mail/scripts/release-audit.mjs`
- Verify only: `plugins/mail/tests/package.spec.ts`
- Verify only: `apps/desktop/tests/plugin-install.e2e.ts`

**Interfaces:**
- Consumes: completed Task 1 archive audit and Task 2 staged install lifecycle.
- Produces: final evidence that the shipped archive and install behavior satisfy the approved design without unrelated repository changes.

- [ ] **Step 1: Inspect the final diff for scope and secrets**

Run:

```bash
git diff HEAD~2 -- plugins/mail apps/desktop/tests/plugin-install.e2e.ts
rg -n "password\s*:|token\s*:|secret\s*:" plugins/mail/cordis.patch.yml
```

Expected: the diff contains only audit/test changes and any narrow first-install guard required by observed upstream behavior; the secret scan returns no matches.

- [ ] **Step 2: Re-run release acceptance from a clean test process**

Run:

```bash
corepack pnpm --dir plugins/mail exec vitest run tests/package.spec.ts
npm --prefix apps/desktop run test:plugin-install
```

Expected: both commands exit zero with fresh temporary package/profile fixtures.

- [ ] **Step 3: Record the final verification commit if cleanup changed files**

If final review required edits, commit only those explicit paths:

```bash
git add plugins/mail/scripts/release-audit.mjs plugins/mail/tests/package.spec.ts apps/desktop/tests/plugin-install.e2e.ts
git commit -m "test(mail): finalize packaged defaults acceptance"
```

If no files changed, do not create an empty commit.
