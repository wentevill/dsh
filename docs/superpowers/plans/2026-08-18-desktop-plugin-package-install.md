# Desktop Plugin Package Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Install a complete published mail plugin package in one bundled `dsh plugin` invocation and boot it immediately from the macOS Desktop private runtime.

**Architecture:** Keep plugin semantics in the CLI, but replace direct mutation with a staged profile transaction for package-changing pnpm verbs. Resolve pnpm through an explicit private-runtime contract, validate the installed bundle before atomically promoting the staged profile, and package pinned pnpm beside bundled Node and dsh. Rebuild and test the mail `.tgz` as the first production package.

**Tech Stack:** TypeScript ESM, Node.js 24.7.0, pnpm 11.7.0, Vitest, Tauri 2/Rust, npm package archives, Cordis loader.

## Global Constraints

- Production inputs are registry specs, URLs, or complete package archives; source-directory `link:` installation is not an acceptance path.
- Desktop installation invokes only private resources inside `DeepSeek Harness.app`; it must not use host Node, npm, pnpm, dsh, PATH mutation, or global installation.
- Plugin-owned libraries are package `dependencies`; DSH/Cordis product capabilities remain `peerDependencies` and resolve from the Desktop runtime closure.
- Package acquisition, dependency installation, artifact validation, and bundle activation are one transaction; failure restores the previous profile.
- Profile boot performs no dependency repair.
- Acceptance is one install command followed immediately by boot, with no profile edits or repair command.

---

### Task 1: Explicit package-manager contract in dsh

**Files:**
- Create: `apps/cli/src/package-manager.ts`
- Modify: `apps/cli/src/plugin.ts`
- Test: `apps/cli/tests/package-manager.spec.ts`
- Test: `apps/cli/tests/built-bin.e2e.ts`

**Interfaces:**
- Produces: `resolvePackageManager(environment: NodeJS.ProcessEnv, installAnchor: string): { command: string; argsPrefix: string[] }`.
- Produces: `runPackageManager(spec, args, options): SpawnSyncReturns<Buffer>` where `spec` always identifies a concrete executable or a JS entry run by the current bundled Node.
- Consumes: `INSTALL_ANCHOR` from `apps/cli/src/profile-boot.ts` to locate a packaged fallback without searching host PATH.

- [ ] **Step 1: Write failing resolver tests**

Add cases proving an absolute `DSH_PACKAGE_MANAGER_JS` becomes `{ command: process.execPath, argsPrefix: [absolutePath] }`, a missing/non-file entry fails with a `dsh:` diagnostic, and absence of the contract fails instead of returning bare `pnpm`. Use a temporary fake `pnpm.cjs`; do not inspect PATH.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `corepack pnpm exec vitest run apps/cli/tests/package-manager.spec.ts`

Expected: FAIL because `package-manager.ts` does not exist.

- [ ] **Step 3: Implement the resolver and route plugin invocations through it**

Implement the private entry contract:

```ts
export interface PackageManagerSpec {
  readonly command: string
  readonly argsPrefix: readonly string[]
}

export function resolvePackageManager(environment: NodeJS.ProcessEnv): PackageManagerSpec {
  const entry = environment.DSH_PACKAGE_MANAGER_JS
  if (entry === undefined) throw new Error('dsh: package manager is unavailable in this installation')
  if (!isAbsolute(entry) || !statSync(entry, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`dsh: packaged package-manager entry is invalid: ${JSON.stringify(entry)}`)
  }
  return { command: process.execPath, argsPrefix: [entry] }
}
```

Change `runPlugin` to spawn `spec.command` with `[...spec.argsPrefix, ...anchoredArgs]`. Preserve Windows shell hardening without falling back to a `.cmd` lookup.

- [ ] **Step 4: Update built-bin fixtures to provide an explicit test package manager**

Point `DSH_PACKAGE_MANAGER_JS` at the test environment's resolved `pnpm/bin/pnpm.cjs`. Add an assertion that setting `PATH` to an empty directory still permits `dsh plugin ... add <fixture.tgz>` when the explicit entry is present.

- [ ] **Step 5: Run focused CLI verification**

Run: `corepack pnpm exec vitest run apps/cli/tests/package-manager.spec.ts apps/cli/tests/built-bin.e2e.ts`

Expected: PASS, including the empty-PATH package operation.

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/package-manager.ts apps/cli/src/plugin.ts apps/cli/tests/package-manager.spec.ts apps/cli/tests/built-bin.e2e.ts
git commit -m "fix(cli): require private plugin package manager"
```

### Task 2: Transactional package install and bundle validation

**Files:**
- Create: `apps/cli/src/profile-transaction.ts`
- Create: `apps/cli/src/plugin-package.ts`
- Modify: `apps/cli/src/plugin.ts`
- Test: `apps/cli/tests/profile-transaction.spec.ts`
- Test: `apps/cli/tests/built-bin.e2e.ts`

**Interfaces:**
- Produces: `withProfileTransaction(profileDir: string, action: (stagedDir: string) => void): void`.
- Produces: `validateInstalledBundles(before: ProfileManifest, stagedDir: string): void`.
- Consumes: `resolveBundleDir`, `readProfileManifest`, and `writeProfileManifest` from `@deepseek-ai/dsh-app-boot`.

- [ ] **Step 1: Write transaction failure tests**

Create a profile containing a healthy fixture bundle, lockfile, and module marker. Run a staged callback that changes all three and throws. Assert byte-for-byte equality of the original manifest and lockfile, preservation of the original marker, and absence of stage/backup directories.

- [ ] **Step 2: Run the transaction test and verify failure**

Run: `corepack pnpm exec vitest run apps/cli/tests/profile-transaction.spec.ts`

Expected: FAIL because `withProfileTransaction` is missing.

- [ ] **Step 3: Implement sibling staging and atomic promotion**

Create the stage under the profile's parent so rename stays on one filesystem. Copy the profile with symlinks preserved, execute the callback against the staged directory, rename the original to a uniquely named backup, rename stage to the original path, and remove the backup. If promotion fails, rename the backup back before rethrowing. Always remove remaining stage/backup paths in `finally`.

- [ ] **Step 4: Write failing package-validation tests**

Cover a package with no declared patch, a missing patch file, a missing main/export entry, an entry whose import reports `ERR_MODULE_NOT_FOUND`, and a complete bundle. Assert every invalid case fails before its name enters `dsh.profile.bundles`.

- [ ] **Step 5: Implement post-install validation**

After pnpm succeeds in the staged directory, derive newly installed dependencies from its manifest. For every dependency declaring `dsh.bundle.patch`, require the patch to be a regular file and resolve the package's runtime entry using its `exports["."].default` or `main`. Spawn `process.execPath` with a small ESM import probe anchored at that entry and the inherited private runtime environment. Only then reconcile bundle names in the staged manifest.

- [ ] **Step 6: Apply transactions to mutating plugin verbs**

Classify `add`, `install`, `update`, `remove`, `unlink`, and `uninstall` as mutating. Run those verbs in `withProfileTransaction`; retain direct read-only forwarding for `list`, `why`, `outdated`, and `root`. Reject unsupported ambiguous verbs with a diagnostic rather than silently bypassing transactionality.

- [ ] **Step 7: Add one-command rollback and success e2e cases**

Pack two fixtures: a complete bundle with one ordinary dependency and a broken bundle importing a missing package. Prove the complete `.tgz` installs and activates in one command; prove the broken `.tgz` returns nonzero and leaves the prior profile byte-for-byte usable.

- [ ] **Step 8: Run focused CLI tests**

Run: `corepack pnpm exec vitest run apps/cli/tests/profile-transaction.spec.ts apps/cli/tests/built-bin.e2e.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/cli/src/profile-transaction.ts apps/cli/src/plugin-package.ts apps/cli/src/plugin.ts apps/cli/tests/profile-transaction.spec.ts apps/cli/tests/built-bin.e2e.ts
git commit -m "fix(cli): install plugin packages transactionally"
```

### Task 3: Package pnpm inside the Desktop runtime

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/stage-runtime.ts`
- Modify: `apps/desktop/scripts/audit-runtime.ts`
- Modify: `apps/desktop/scripts/audit-app.ts`
- Modify: `apps/desktop/src-tauri/src/resources.rs`
- Modify: `apps/desktop/src-tauri/src/lifecycle.rs`
- Test: `apps/desktop/scripts/stage-runtime.spec.ts`
- Test: `apps/desktop/scripts/audit-runtime.spec.ts`
- Test: `apps/desktop/scripts/audit-app.spec.ts`
- Test: `apps/desktop/src-tauri/tests/resources.rs`
- Test: `apps/desktop/src-tauri/tests/lifecycle.rs`

**Interfaces:**
- Extends `RuntimePaths` with `package_manager: PathBuf` resolved as `runtime/app/node_modules/pnpm/bin/pnpm.cjs`.
- Extends `StartSpec` with `package_manager: PathBuf` and supplies `DSH_PACKAGE_MANAGER_JS` to the child server only.
- Consumes pnpm package version exactly `11.7.0` as a Desktop production dependency.

- [ ] **Step 1: Write failing runtime resource and environment tests**

Assert resource discovery fails when `pnpm/bin/pnpm.cjs` is absent, succeeds when Node/dsh/pnpm are regular files, and the server child receives `DSH_PACKAGE_MANAGER_JS=<resource path>` even when host PATH is empty.

- [ ] **Step 2: Run Rust and Desktop tests to verify failure**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests`

Run: `corepack pnpm --filter @deepseek-ai/dsh-desktop test`

Expected: FAIL on the missing `package_manager` field and audit expectation.

- [ ] **Step 3: Add pinned pnpm to the deployed closure**

Add `"pnpm": "11.7.0"` to Desktop `dependencies`. Keep it inside `runtime/app/node_modules`; do not generate a host-facing shell shim or copy anything into `/usr/local/bin`.

- [ ] **Step 4: Wire the private entry into Desktop server startup**

Resolve the pnpm JS entry in `RuntimePaths`, pass it through `StartSpec`, and set only the child process environment:

```rust
command.env("DSH_PACKAGE_MANAGER_JS", &spec.package_manager);
```

Do not read host PATH to locate any runtime component.

- [ ] **Step 5: Strengthen release audits**

Require the pnpm entry in staged runtime and built `.app`, verify it is a regular file, and run `bundled-node pnpm.cjs --version` expecting exactly `11.7.0`. Add a negative fixture proving the audit fails when pnpm is omitted.

- [ ] **Step 6: Run Desktop verification**

Run: `corepack pnpm --filter @deepseek-ai/dsh-desktop test`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml apps/desktop/scripts apps/desktop/src-tauri/src apps/desktop/src-tauri/tests
git commit -m "build(desktop): bundle private plugin package manager"
```

### Task 4: Correct and repack the production mail plugin

**Files:**
- Modify outside repository fixture: `../../test/mail-plugin/package.json`
- Modify outside repository fixture: `../../test/mail-plugin/cordis.patch.yml`
- Regenerate outside repository fixture: `../../test/mail-plugin/lib/**`
- Regenerate outside repository fixture: `../../test/mail-plugin/dsh-mail-plugin-0.1.0.tgz`
- Create: `apps/cli/tests/mail-package.e2e.ts`

**Interfaces:**
- Produces the package archive `dsh-mail-plugin@0.1.0` with loadable `lib/index.js` and `dsh.bundle.patch = "./cordis.patch.yml"`.
- Consumes Desktop-provided peers `@deepseek-ai/cordis`, `@deepseek-ai/dsh-credentials`, `@deepseek-ai/dsh-mail`, `@deepseek-ai/dsh-settings`, `@deepseek-ai/dsh-system-prompt`, and `@deepseek-ai/dsh-tools`.
- Consumes installed ordinary dependencies `@deepseek-ai/schemastery`, `imapflow`, `mailparser`, and `nodemailer`.

- [ ] **Step 1: Write the packaged-mail failing acceptance test**

Use a fresh Harness home and the staged Desktop Node/dsh/pnpm paths. Run exactly one plugin add against the `.tgz`, assert the stored spec is not `link:`, import the installed entry, and compose/activate the mail row with network transport replaced by a deterministic fixture seam.

- [ ] **Step 2: Run the acceptance test and capture the current failure**

Run: `corepack pnpm exec vitest run apps/cli/tests/mail-package.e2e.ts`

Expected: FAIL on the first unresolved dependency or stale package artifact; record the exact package name in the test assertion.

- [ ] **Step 3: Align the mail package manifest and compiled artifacts**

Keep all six product capabilities as peers. Ensure the four ordinary libraries are dependencies. Rebuild host and client outputs so no `.ts` import remains in published JS. Align the patch endpoint fields with the exported configuration schema; use the schema's actual `secure: true` representation if that remains the implemented API.

- [ ] **Step 4: Pack and inspect the archive**

Run from `../../test/mail-plugin`:

```bash
corepack pnpm run build
corepack pnpm run build:client
corepack pnpm pack
```

Inspect with `tar -tzf dsh-mail-plugin-0.1.0.tgz` and require `package/package.json`, `package/lib/index.js`, the declared client entry, `package/cordis.patch.yml`, and `package/LICENSE`.

- [ ] **Step 5: Run the one-command acceptance test**

Run: `corepack pnpm exec vitest run apps/cli/tests/mail-package.e2e.ts`

Expected: PASS with no repair step.

- [ ] **Step 6: Commit repository-owned acceptance coverage**

The external fixture is intentionally outside this repository and is not included in the repository commit. Record its archive SHA-256 in the test fixture assertion so an accidental stale archive fails loudly.

```bash
git add apps/cli/tests/mail-package.e2e.ts
git commit -m "test(cli): cover packaged mail plugin install"
```

### Task 5: Release-shaped end-to-end verification and documentation

**Files:**
- Create: `apps/desktop/tests/plugin-install.e2e.ts`
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`
- Modify: `apps/cli/README.md`
- Modify: `apps/cli/README.zh.md`
- Modify: `docs/user/develop/basic/publish.md`
- Modify: `docs/user/develop/basic/publish.zh.md`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Consumes the final staged runtime and mail archive from Tasks 3 and 4.
- Produces a release gate invoked by Desktop build before `.app` and DMG packaging complete.

- [ ] **Step 1: Write the release-shaped failing e2e test**

Copy the staged runtime to an isolated fixture, set host PATH to an empty directory, and invoke bundled Node + bundled dsh with `DSH_PACKAGE_MANAGER_JS` pointing to bundled pnpm. Install the mail archive once, then run an activation probe. Assert no profile value contains the source checkout path and no host executable was invoked.

- [ ] **Step 2: Run the e2e test and verify failure before build wiring**

Run: `corepack pnpm exec vitest run apps/desktop/tests/plugin-install.e2e.ts`

Expected: FAIL until the final staged runtime and test script contract are wired.

- [ ] **Step 3: Add the install smoke to the Desktop build gate**

Add `test:plugin-install` and invoke it after `audit:runtime` and before Tauri build. Keep the existing post-build `.app` audit and DMG creation order.

- [ ] **Step 4: Document production package semantics**

Document registry/URL/`.tgz` inputs, one-command behavior, private Desktop toolchain, ordinary dependency versus product peer ownership, transaction rollback, and the explicit statement that a local source directory/link is development-only.

- [ ] **Step 5: Run all focused and release verification**

Run:

```bash
corepack pnpm exec vitest run apps/cli/tests/package-manager.spec.ts apps/cli/tests/profile-transaction.spec.ts apps/cli/tests/mail-package.e2e.ts apps/desktop/tests/plugin-install.e2e.ts
corepack pnpm --filter @deepseek-ai/dsh-desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm run constraints
corepack pnpm run doc-sync
```

Expected: every command exits 0.

- [ ] **Step 6: Build and audit the release artifact**

Run the documented Desktop stage/build pipeline with the pinned Node archive. Confirm `audit:runtime`, the plugin-install smoke, Tauri `.app` build, `audit:app`, and DMG creation all exit 0.

- [ ] **Step 7: Reinstall mail through the bundled command and launch**

Against the actual application Harness home, run the application-private Node/dsh/pnpm paths for one `plugin --profile web add <mail.tgz>` operation. Launch Desktop normally and confirm the server stays ready and the mail bundle is present. Do not run host pnpm or edit the profile.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/tests/plugin-install.e2e.ts apps/desktop/package.json apps/desktop/README.md apps/desktop/README.zh.md apps/cli/README.md apps/cli/README.zh.md docs/user/develop/basic/publish.md docs/user/develop/basic/publish.zh.md
git commit -m "docs: require one-step packaged plugin install"
```
