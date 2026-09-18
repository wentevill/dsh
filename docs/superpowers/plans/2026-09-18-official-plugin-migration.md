# Official Plugin Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the private `dsh-plugin-manager`, install all repository plugins through the official CLI, and move plugin configuration forms to the official v0.1.6 Plugins page.

**Architecture:** The pinned upstream runtime remains the sole owner of plugin management. Desktop stops staging or bootstrapping a second manager, the Makefile exposes a five-plugin archive matrix over `dsh plugin add`, and each configurable external bundle registers a row-scoped page through `plugins.row.config`.

**Tech Stack:** GNU Make, Node.js/TypeScript, React, Cordis client slots, Rust/Tauri, Vitest, pnpm.

**Spec:** `docs/superpowers/specs/2026-09-18-official-plugin-migration-design.md`

## Global Constraints

- Upstream stays pinned to `dsh-v0.1.6-alpha.2` / `ddefc45fbc7f8e46dd73185e68295696d1297887`.
- Do not modify existing user profiles or automatically uninstall `dsh-plugin-manager`.
- The staged runtime keeps `patchLegacyTypertCompatibility` for pre-v0.1.6 plugin archives.
- External plugin clients import the official UI plugin-manager contract only as a TypeScript type dependency.
- Supported Makefile plugins are exactly `mail`, `wecom`, `confluence`, `nextcloud`, and `cron`.

---

### Task 1: Remove the private Desktop plugin manager

**Files:**
- Delete: `plugins/manager/**`
- Delete: `apps/desktop/scripts/ensure-plugin-manager.mjs`
- Delete: `apps/desktop/scripts/ensure-plugin-manager.spec.ts`
- Modify: `package.json`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/stage-runtime.ts`
- Modify: `apps/desktop/scripts/stage-runtime.spec.ts`
- Modify: `apps/desktop/src-tauri/src/resources.rs`
- Modify: `apps/desktop/src-tauri/src/lifecycle.rs`
- Modify: `apps/desktop/src-tauri/src/main.rs`
- Modify: `apps/desktop/src-tauri/tests/resources.rs`
- Modify: `apps/desktop/src-tauri/tests/lifecycle.rs`
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`

**Interfaces:**
- Consumes: upstream `@deepseek-ai/dsh-plugin-manager` already reachable through `@deepseek-ai/dsh` and the base bundle.
- Produces: `RuntimePaths { node, cli, package_bin }` and `StartSpec { node, cli, package_bin, dsh_home, ... }` with no private-manager fields.

- [ ] **Step 1: Change tests to require a manager-free runtime**

Remove manager fixtures from Rust resource/lifecycle tests and replace the staging manager tests with a runtime-closure assertion that `patchLegacyTypertCompatibility` remains callable without manager assets. The resource fixture should only create Node, CLI, and `.bin`, then expect:

```rust
assert_eq!(paths.node, node);
assert_eq!(paths.cli, cli);
assert_eq!(paths.package_bin, package_bin);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
corepack pnpm --dir apps/desktop exec vitest run scripts/stage-runtime.spec.ts --config vitest.config.ts
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test resources --test lifecycle
```

Expected: TypeScript references to removed manager exports and Rust struct initializers/expectations fail against the current production code.

- [ ] **Step 3: Remove production manager ownership**

Delete the manager package and bootstrap files. Remove root manager scripts and the Desktop `dsh-plugin-manager` dependency. In `stageRuntime`, remove `copyPluginManagerPackage`, `stagePluginManagerAssets`, `packPluginManagerPackage`, their types/imports, and the `plugins/manager` overlay while preserving:

```ts
renameSync(join(deploy, 'node_modules'), join(staged, 'app', 'node_modules'))
patchLegacyTypertCompatibility(join(staged, 'app'))
installStagedRuntime(staged, destination)
```

Remove the bootstrap process and `ManagerBootstrap` error from `ServerProcess::start`. Simplify Tauri setup to pass only official runtime paths.

- [ ] **Step 4: Update Desktop documentation**

Replace the private manager/archive description with a statement that the upstream Plugins sidebar and official CLI own bundle management. Do not promise cleanup of profiles created by older Desktop builds.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the two commands from Step 2. Expected: all focused TypeScript and Rust tests pass.

### Task 2: Complete the Makefile plugin matrix

**Files:**
- Modify: `Makefile`
- Modify: `packaging/makefile.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: plugin manifests at `plugins/<name>/package.json`, root `<name>:pack` scripts, bundled Node/CLI/pnpm paths.
- Produces: `pack-plugin` and `install-plugin` behavior for the exact five supported plugin names.

- [ ] **Step 1: Add failing Makefile behavior tests**

Add table-driven dry-run cases with literal package/script expectations:

```ts
for (const [plugin, packageName] of [
  ['wecom', 'dsh-wecom'],
  ['confluence', 'dsh-confluence'],
  ['nextcloud', 'dsh-nextcloud'],
  ['cron', 'dsh-cron'],
] as const) {
  const output = dryRun('install-plugin', [`PLUGIN=${plugin}`, 'PROFILE=custom', 'APP_PATH=/tmp/DeepSeek Harness.app'])
  expect(output).toContain(`plugins/${plugin}/${packageName}-`)
  expect(output).toContain('plugin --profile "custom" add')
}
```

Change the unsupported-plugin assertion to contain exactly:

```text
supported plugins: mail wecom confluence nextcloud cron
```

and assert `PLUGIN=manager` is rejected.

- [ ] **Step 2: Run Makefile tests and verify RED**

Run:

```bash
corepack pnpm exec vitest run packaging/makefile.spec.ts
```

Expected: Cron is unsupported and manager remains accepted.

- [ ] **Step 3: Implement the five-plugin matrix**

Remove the manager branch, add:

```make
else ifeq ($(PLUGIN),cron)
PLUGIN_PACKAGE := dsh-cron
PLUGIN_PACK_SCRIPT := cron:pack
```

Update help/error text and retain Mail's hermetic wrapper. Ensure root `cron:pack` remains present and no manager scripts remain.

- [ ] **Step 4: Run Makefile tests and verify GREEN**

Run the command from Step 2. Expected: all Makefile behavior tests pass.

### Task 3: Move configuration forms to official row pages

**Files:**
- Modify: `plugins/mail/src/client/index.ts`
- Modify: `plugins/mail/src/client/slot-options.ts`
- Modify: `plugins/mail/src/client/MailCard.tsx`
- Modify: `plugins/mail/package.json`
- Modify: `plugins/mail/tests/client-slot.spec.ts`
- Modify: `plugins/wecom/src/client/index.tsx`
- Modify: `plugins/wecom/src/client/slot-options.ts`
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/wecom/tests/client-slot.spec.ts`
- Modify: `plugins/confluence/src/client/index.tsx`
- Modify: `plugins/confluence/src/client/slot-options.ts`
- Modify: `plugins/confluence/package.json`
- Modify: `plugins/confluence/tests/client-contract.spec.ts`
- Modify: `plugins/nextcloud/src/client/index.tsx`
- Modify: `plugins/nextcloud/src/client/slot-options.ts`
- Modify: `plugins/nextcloud/package.json`
- Modify: `plugins/nextcloud/tests/client-slot.spec.ts`

**Interfaces:**
- Consumes: `PluginConfigViewProps { view: 'summary' | 'page' }` from `@deepseek-ai/dsh-client-ui-plugin-manager/client` and existing plugin Remote/settings controllers.
- Produces: four keyed `plugins.row.config` registrations using `<package>#<row>` keys; summary renders no form or Remote-backed page component.

- [ ] **Step 1: Change slot contract tests to official keys and views**

For each plugin, assert literal options such as:

```ts
expect(MAIL_CARD_SLOT_OPTIONS).toEqual({
  name: 'plugins.row.config',
  key: 'dsh-mail#mail',
  locale: 'settings.plugins.mail',
})
```

Add component assertions that `view: 'summary'` returns only localized description text and `view: 'page'` exposes the existing save/authorization controls without the old expandable list-card shell.

- [ ] **Step 2: Run the four plugin test suites and verify RED**

Run:

```bash
corepack pnpm exec vitest run plugins/mail/tests plugins/wecom/tests plugins/confluence/tests plugins/nextcloud/tests
```

Expected: old `settings.plugin.item` options and renderers fail the new expectations.

- [ ] **Step 3: Implement type-only official slot registration**

Replace old settings-plugin type imports with:

```ts
import type { PluginConfigViewProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
```

Register `plugins.row.config` and branch renderers before constructing a page form:

```tsx
({ t, view }: PluginConfigViewProps & { t: (key: LocaleKey) => string }) =>
  view === 'summary' ? t('description') : <PluginForm ... />
```

Forms render their body directly. They retain existing save/test/auth behavior, but remove `<li>`, expandable header, chevron, and local `open` state. Add the official UI manager package as a development-only workspace dependency where TypeScript resolution requires it.

- [ ] **Step 4: Run the four plugin test suites and verify GREEN**

Run the command from Step 2. Expected: all plugin tests pass.

### Task 4: Integration, audit, and release verification

**Files:**
- Modify as required by integration failures only within the files listed above.
- Regenerate: `apps/desktop/src-tauri/resources/runtime/**` (ignored build resource)
- Generate: signed `.app` and `.dmg` build artifacts.

**Interfaces:**
- Consumes: manager-free Desktop runtime, official plugin CLI, new configuration slots, Typert compatibility adapter.
- Produces: verified Apple Silicon DMG using upstream v0.1.6-alpha.2.

- [ ] **Step 1: Run source-level suites**

Run:

```bash
corepack pnpm test
corepack pnpm --dir apps/desktop test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests
corepack pnpm exec vitest run plugins/mail/tests plugins/wecom/tests plugins/confluence/tests plugins/nextcloud/tests plugins/cron/tests
```

Expected: zero failures.

- [ ] **Step 2: Rebuild and audit the runtime**

Run:

```bash
corepack pnpm run desktop:stage -- --archive .cache/release/node-v22.19.0-darwin-arm64.tar.gz
corepack pnpm --dir apps/desktop audit:runtime
```

Expected: staging and audit exit zero; no private manager archive/bootstrap exists; official manager packages remain in the upstream closure.

- [ ] **Step 3: Run plugin installation E2E**

Run:

```bash
corepack pnpm --dir apps/desktop test:plugin-install
```

Expected: the packaged legacy-schema Mail archive installs and activates through the official CLI.

- [ ] **Step 4: Build and verify the release artifact**

Run:

```bash
corepack pnpm run desktop:build
codesign --verify --deep --strict --verbose=2 "apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/DeepSeek Harness.app"
hdiutil verify "apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/DeepSeek Harness_0.1.0_aarch64.dmg"
shasum -a 256 "apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/DeepSeek Harness_0.1.0_aarch64.dmg"
```

Expected: build, strict signing check, DMG verification, and checksum generation all succeed.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only approved migration, upstream upgrade, and pre-existing `.superpowers/brainstorm/` state are present.
