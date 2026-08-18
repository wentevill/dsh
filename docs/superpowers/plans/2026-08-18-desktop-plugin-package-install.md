# Desktop Native DSH Plugin Installation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the unmodified upstream `dsh` install the complete mail plugin package in one invocation using only Node and pnpm contained in the macOS application.

**Architecture:** Tauri continues to execute `runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js` with the bundled Node executable. It prepends `runtime/node/bin` and `runtime/app/node_modules/.bin` to the child-only PATH, allowing upstream's existing `spawnSync('pnpm')` to resolve the packaged pnpm shim without changing upstream source or the host environment. The packaging repository owns the publishable mail plugin and release-shaped acceptance coverage.

**Tech Stack:** Rust, Tauri 2, TypeScript ESM, Node.js 24.7.0, pnpm 11.7.0, Vitest, npm package archives.

## Global Constraints

- `upstream` stays clean at revision `47f943859bef60e4160492346772ded9b24f765a`.
- The Desktop CLI is upstream `@deepseek-ai/dsh`; no wrapper, proxy, or patched CLI is introduced.
- The host does not install or expose Node, npm, pnpm, or dsh.
- Production plugin input is a registry spec, URL, or complete `.tgz`, never a source-directory `link:`.
- One native `dsh plugin --profile web add <mail.tgz>` invocation must install dependencies and activate the bundle; the next operation is normal profile boot, with no repair.
- Tauri modifies PATH only in the child process environment.

---

### Task 1: Construct the private child PATH

**Files:**
- Modify: `apps/desktop/src-tauri/src/resources.rs`
- Modify: `apps/desktop/src-tauri/src/lifecycle.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Test: `apps/desktop/src-tauri/tests/resources.rs`
- Test: `apps/desktop/src-tauri/tests/lifecycle.rs`

**Interfaces:**
- Produces: `RuntimePaths { node, cli, package_bin }`, where `package_bin` is `runtime/app/node_modules/.bin`.
- Produces: `private_runtime_path(node: &Path, package_bin: &Path, inherited: Option<&OsStr>) -> Result<OsString, JoinPathsError>`.
- Consumes: `StartSpec.package_bin: PathBuf`; `ServerProcess::start` installs the returned value as the child `PATH`.

- [ ] **Step 1: Write failing resource and PATH behavior tests**

Add a resource test requiring `.bin` to exist as a directory. Add lifecycle tests with temporary `node/bin` and `app/node_modules/.bin` paths, asserting the first two split PATH entries are those exact directories and inherited entries follow them. Add a process test whose fake CLI runs `pnpm`, while a private `pnpm` fixture prints the normal DSH readiness line; set the inherited PATH to a directory containing a failing host `pnpm` and prove the private command wins.

- [ ] **Step 2: Run the Rust tests and verify RED**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests`

Expected: FAIL because `RuntimePaths.package_bin`, `StartSpec.package_bin`, and `private_runtime_path` do not exist.

- [ ] **Step 3: Implement the minimal private PATH construction**

Resolve `package_bin` as a required directory. Build PATH with `std::env::join_paths([node.parent(), package_bin, inherited entries...])`, rejecting malformed inherited PATH. Set it through `command.env("PATH", private_path)` before spawn. Do not mutate the parent process environment.

- [ ] **Step 4: Run Rust tests and verify GREEN**

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests`

Expected: PASS, including private pnpm precedence.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src-tauri/src apps/desktop/src-tauri/tests
git commit -m "fix(desktop): use private runtime path for dsh"
```

### Task 2: Bundle and audit pnpm as a private runtime dependency

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/audit-runtime.ts`
- Modify: `apps/desktop/scripts/audit-runtime.spec.ts`
- Modify: `apps/desktop/scripts/stage-runtime.spec.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: runtime files `app/node_modules/pnpm/bin/pnpm.cjs` and `app/node_modules/.bin/pnpm`.
- Extends: `auditRuntime(root)` to execute `node pnpm.cjs --version` and require literal `11.7.0`.
- Consumes: the existing immutable `stageRuntime` deploy flow and symlink materialization.

- [ ] **Step 1: Write failing audit tests**

Extend the audit fixture with a fake Node executable and assert missing `pnpm/bin/pnpm.cjs` fails with `Missing runtime artifact`. Add a fixture with a pnpm entry reporting the wrong version and assert the audit rejects it. Extend staging link coverage so a `.bin/pnpm` link is materialized to a regular executable file.

- [ ] **Step 2: Run focused Desktop tests and verify RED**

Run: `corepack pnpm --filter @deepseek-ai/dsh-desktop test -- scripts/audit-runtime.spec.ts scripts/stage-runtime.spec.ts`

Expected: FAIL because pnpm is not required or version-audited.

- [ ] **Step 3: Add the pinned dependency and minimal audit**

Add `"pnpm": "11.7.0"` to Desktop production dependencies. Require both the pnpm JS entry and `.bin/pnpm` as regular runtime files after materialization. Execute `[pnpmEntry, '--version']` with bundled Node and require `11.7.0`.

- [ ] **Step 4: Refresh only the disposable packaging lock state**

Run: `corepack pnpm install --lockfile-only --no-frozen-lockfile`

Expected: the outer `pnpm-lock.yaml` records pnpm 11.7.0; `git -C upstream status --short` remains empty.

- [ ] **Step 5: Run Desktop tests and runtime staging**

Run: `corepack pnpm --filter @deepseek-ai/dsh-desktop test`

Run: `corepack pnpm verify:upstream`

Run the existing `stage:runtime` command with the pinned Node archive used by this workspace, then run `corepack pnpm --filter @deepseek-ai/dsh-desktop audit:runtime`.

Expected: all commands PASS and the audit prints no host/workspace dependency.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/package.json apps/desktop/scripts pnpm-lock.yaml
git commit -m "build(desktop): bundle private pnpm runtime"
```

### Task 3: Own and publish the complete mail plugin package

**Files:**
- Create: `plugins/mail/package.json`
- Create: `plugins/mail/cordis.patch.yml`
- Create: `plugins/mail/LICENSE`
- Create: `plugins/mail/README.md`
- Create: `plugins/mail/src/**`
- Create: `plugins/mail/tsconfig.json`
- Create: `plugins/mail/tsconfig.build.json`
- Create: `plugins/mail/tsdown.config.ts`
- Create: `plugins/mail/tests/package.spec.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `plugins/mail/dsh-mail-plugin-0.1.0.tgz` via `pnpm --dir plugins/mail pack`.
- Produces: package manifest ordinary dependencies `@deepseek-ai/schemastery`, `imapflow`, `mailparser`, and `nodemailer`; product capabilities remain peers.
- Consumes: the source formerly prototyped in `../test/mail-plugin`, copied into this packaging-owned directory and then maintained here.

- [ ] **Step 1: Write a failing archive contract test**

Pack the plugin to a temporary directory and inspect the archive. Assert it contains `package/package.json`, `package/lib/index.js`, `package/lib/client.js`, `package/cordis.patch.yml`, and `package/LICENSE`. Extract the manifest and assert all four ordinary runtime libraries are dependencies and all six DSH/Cordis capabilities are peers. Assert the patch uses `secure: true`, matching the endpoint schema, and contains no `tls: implicit`.

- [ ] **Step 2: Run the package test and verify RED**

Run: `corepack pnpm exec vitest run plugins/mail/tests/package.spec.ts`

Expected: FAIL because `plugins/mail` is not yet a packaging-owned publishable package.

- [ ] **Step 3: Copy the prototype into the packaging repository and correct it**

Recreate the prototype's source/configuration under `plugins/mail` without changing `../test/mail-plugin`. Remove development-only `install.sh` from published files and remove `./src/*` exports. Change both IMAP and SMTP patch endpoints to `{ host, port, secure: true }`. Keep all runtime imports represented by dependencies or peers.

- [ ] **Step 4: Register, install, build, and pack**

Add `plugins/*` to the outer workspace, add scripts `mail:build`, `mail:pack`, and `mail:test`, refresh the lockfile, build host/client artifacts, and pack the archive.

- [ ] **Step 5: Run package tests and verify GREEN**

Run: `corepack pnpm mail:test`

Run: `corepack pnpm mail:build`

Run: `corepack pnpm mail:pack`

Expected: PASS and a complete `dsh-mail-plugin-0.1.0.tgz` is produced from repository-owned sources.

- [ ] **Step 6: Commit**

```bash
git add plugins/mail package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(plugin): package complete mail bundle"
```

### Task 4: Prove one native dsh install followed by immediate boot

**Files:**
- Create: `apps/desktop/tests/plugin-install.e2e.ts`
- Modify: `apps/desktop/vitest.config.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/audit-app.spec.ts`
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`

**Interfaces:**
- Consumes: staged `runtime/node/bin/node`, upstream `runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js`, private `runtime/app/node_modules/.bin`, and repository-owned mail `.tgz`.
- Produces: `test:plugin-install`, a release gate that uses a fresh `DSH_HOME` and no usable host Node/pnpm/dsh.

- [ ] **Step 1: Write the failing release-shaped test**

Create a temporary Harness home and hostile inherited PATH. Construct the same private PATH order as Tauri, then run exactly:

```text
<bundled-node> <upstream-dsh-lib/bin.js> plugin --profile web add <mail.tgz>
```

Assert exit code zero, no `link:` dependency, one `dsh-mail-plugin` bundle layer, and resolvability of `@deepseek-ai/schemastery`, `imapflow`, `mailparser`, and `nodemailer` from the installed package. Invoke upstream `dsh dump-config --profile web` immediately afterward and assert the mail row is composed without running any install or repair command.

- [ ] **Step 2: Run the e2e and verify RED**

Run: `corepack pnpm --filter @deepseek-ai/dsh-desktop test:plugin-install`

Expected: FAIL until runtime pnpm and the repository-owned archive are both wired into the test.

- [ ] **Step 3: Add the release gate and documentation**

Add `test:plugin-install` to Desktop scripts and call it after `audit:runtime` in the release build pipeline. Document that the app owns Node/dsh/pnpm, plugins must be complete packages, and source-directory links are unsupported in production.

- [ ] **Step 4: Verify e2e and the full repository**

Run: `corepack pnpm --filter @deepseek-ai/dsh-desktop test:plugin-install`

Run: `corepack pnpm --filter @deepseek-ai/dsh-desktop test`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests`

Run: `corepack pnpm verify:upstream`

Expected: all PASS; `git -C upstream status --short` is empty.

- [ ] **Step 5: Reconcile project knowledge and commit**

Record verified relations from `ServerProcess::start` to the private runtime PATH and from Desktop staging to pnpm, validate the ledger, then commit:

```bash
git add apps/desktop .project-knowledge
git commit -m "test(desktop): gate native packaged plugin install"
```

### Task 5: Release-shaped application audit

**Files:**
- Modify: `apps/desktop/scripts/audit-app.spec.ts`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Consumes: Task 2 `auditRuntime` and Task 4 `test:plugin-install`.
- Produces: a build pipeline ordered as runtime audit, native plugin-install test, Tauri application build, built-app audit, and DMG creation.

- [ ] **Step 1: Add a failing build-pipeline behavior test**

Exercise the package scripts through a parsed manifest fixture and assert the plugin-install gate occurs after runtime audit and before `tauri build`; assert app audit occurs before DMG packaging.

- [ ] **Step 2: Run the test and verify RED**

Run: `corepack pnpm --filter @deepseek-ai/dsh-desktop test -- scripts/audit-app.spec.ts`

Expected: FAIL because the build script does not invoke `test:plugin-install`.

- [ ] **Step 3: Insert the gate and run release verification**

Update the build script ordering, run all TypeScript/Rust tests, stage and audit the runtime, build the `.app`, audit it, and create the drag-install DMG using the existing scripts.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/package.json apps/desktop/scripts/audit-app.spec.ts
git commit -m "build(desktop): gate plugin install before release"
```
