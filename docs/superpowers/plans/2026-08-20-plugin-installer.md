# Drag-and-Drop Plugin Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Desktop plugin-list card that validates a dropped `.tgz`, previews its YAML publishing manifest, confirms replacement of an installed plugin, installs through the private upstream `dsh` CLI, and asks the user to restart manually.

**Architecture:** A new `plugins/installer` package owns a small manifest/archive domain, upload-session service, private-CLI adapter, Typert Remote, and browser card. The Host accepts bounded chunks into private temporary storage, validates the immutable archive, and issues a digest-bound single-use confirmation token before invoking `dsh plugin --profile web add --ignore-scripts <archive>`. Existing mail and WeCom archives adopt the same `dsh.plugin.yml` contract.

**Tech Stack:** TypeScript 6, React 19, Cordis, Schemastery, Typert Remote, Node.js 24 (`node:zlib`, `node:crypto`, `node:child_process`), `tar-stream`, `yaml`, pnpm 11.7.0, Vitest.

## Global Constraints

- Accept exactly one `.tgz`; browser and Host limits are 100 MiB compressed, 1 MiB sequential chunks.
- Manifest path is `package/dsh.plugin.yml`, schema version is exactly `1`, and YAML aliases, custom tags, duplicate keys, and unknown fields are rejected.
- Expanded archive limits are 512 MiB total, 128 MiB per entry, 20,000 entries, and a maximum compression ratio of 100:1.
- Reject absolute paths, non-normalized paths, `..`, files outside `package/`, links, devices, FIFOs, duplicate critical entries, and local/workspace dependency specs.
- The only mutation is private `dsh plugin --profile web add --ignore-scripts <Host-owned temporary archive>`; never accept a profile, path, command, environment, or package name from the Client.
- The pinned public `upstream` checkout remains byte-for-byte clean.
- Success never hot-reloads or restarts the application; it instructs the user to restart manually.
- Temporary paths, child environments, and unrestricted CLI output never cross the Remote boundary.

---

### Task 1: Define and adopt the YAML publishing manifest

**Files:**
- Create: `plugins/installer/src/manifest.ts`
- Create: `plugins/installer/tests/manifest.spec.ts`
- Create: `plugins/mail/dsh.plugin.yml`
- Create: `plugins/wecom/dsh.plugin.yml`
- Modify: `plugins/mail/package.json`
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/mail/tests/package.spec.ts`
- Modify: `plugins/wecom/tests/release-package.spec.ts`

**Interfaces:**
- Produces: `PluginManifest`, `parsePluginManifest(yamlText: string): PluginManifest`, and `assertManifestMatchesPackage(manifest, packageJson): void`.
- Produces: `package.json#dsh.plugin.manifest === './dsh.plugin.yml'` for every private plugin.

- [ ] **Step 1: Write failing manifest unit tests**

Cover a valid manifest plus missing fields, unknown keys, duplicate YAML keys, alias use, custom tags, invalid `id`, non-HTTP(S) URLs, unsupported `schemaVersion`, and package/version mismatch. Pin the public shape:

```ts
expect(parsePluginManifest(validYaml)).toEqual({
  schemaVersion: 1,
  id: 'wecom',
  name: '企业微信 AI',
  package: 'dsh-wecom',
  version: '0.2.3',
  description: '企业微信 AI 插件',
  publisher: { name: 'DeepSeek Harness', url: 'https://deepseek.com' },
  homepage: 'https://deepseek.com',
  repository: 'https://github.com/deepseek-ai/DeepSeek-Harness',
  license: 'MIT',
})
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `corepack pnpm exec vitest run plugins/installer/tests/manifest.spec.ts plugins/mail/tests/package.spec.ts plugins/wecom/tests/release-package.spec.ts`

Expected: FAIL because the parser and YAML manifests do not exist.

- [ ] **Step 3: Implement the strict parser**

Use `yaml.parseDocument` with strict duplicate-key handling, reject `doc.errors`, walk the document nodes to reject aliases and non-core tags, then validate an exact-key plain object. Define:

```ts
export interface PluginManifest {
  readonly schemaVersion: 1
  readonly id: string
  readonly name: string
  readonly package: string
  readonly version: string
  readonly description: string
  readonly publisher: { readonly name: string; readonly url: string }
  readonly homepage: string
  readonly repository: string
  readonly license: string
}
```

Use `/^[a-z0-9]+(?:-[a-z0-9]+)*$/u` for `id`, npm package-name validation for `package`, the existing strict semver shape for `version`, and `new URL` restricted to `http:`/`https:` for URLs. Throw `InstallerError` only after Task 2 introduces it; in this task use `TypeError` with stable message prefixes `plugin manifest:`.

- [ ] **Step 4: Add real manifests and package pointers**

Add `dsh.plugin.yml` to each package's `files`; add `dsh.plugin.manifest` beside `dsh.bundle`; populate the exact package versions and repository publishing data. Extend archive tests to assert the YAML file is packed, parses, and matches the extracted root package manifest.

- [ ] **Step 5: Run tests and pack both plugins**

Run: `corepack pnpm exec vitest run plugins/installer/tests/manifest.spec.ts plugins/mail/tests/package.spec.ts plugins/wecom/tests/release-package.spec.ts`

Run: `corepack pnpm mail:pack && corepack pnpm wecom:pack`

Expected: PASS; both `.tgz` archives contain `package/dsh.plugin.yml`.

- [ ] **Step 6: Commit**

```bash
git add plugins/installer/src/manifest.ts plugins/installer/tests/manifest.spec.ts plugins/mail plugins/wecom
git commit -m "feat(plugins): define publishing manifest"
```

### Task 2: Build the safe archive inspector

**Files:**
- Create: `plugins/installer/src/errors.ts`
- Create: `plugins/installer/src/archive.ts`
- Create: `plugins/installer/src/types.ts`
- Create: `plugins/installer/tests/archive.spec.ts`

**Interfaces:**
- Consumes: `parsePluginManifest`, `assertManifestMatchesPackage` from Task 1.
- Produces: `inspectPluginArchive(path: string): Promise<InspectedPlugin>`.
- Produces: stable `InstallerErrorCode` and `InstallerError` safe-message boundary.

- [ ] **Step 1: Write malicious and valid archive fixtures**

Create tar-stream fixtures in the test process for a valid package and each rejection: bad gzip, absolute/traversal/non-normalized/outside-root path, symlink, hardlink, device, FIFO, duplicate manifest, missing manifest/patch/main/client, entry-count limit, per-entry size, expanded total, compression ratio, malformed package JSON, local `file:`/`link:`/`workspace:` dependencies, and inconsistent YAML identity.

- [ ] **Step 2: Run the archive test and verify RED**

Run: `corepack pnpm exec vitest run plugins/installer/tests/archive.spec.ts`

Expected: FAIL because `inspectPluginArchive` does not exist.

- [ ] **Step 3: Implement bounded streaming inspection**

Pipe `createReadStream(path)` through `createGunzip()` and `tar-stream.extract()`. Count compressed bytes from `stat`, expanded bytes per entry and globally, entries, and critical-path occurrences. Drain every entry, retain only bounded bytes for `package/package.json` and `package/dsh.plugin.yml`, and accept regular files/directories only. Normalize with `posix.normalize` and require `normalized === name`, no leading slash, and `name.startsWith('package/')`.

Return only metadata:

```ts
export interface InspectedPlugin {
  readonly digest: string
  readonly manifest: PluginManifest
  readonly packageName: string
  readonly version: string
  readonly bundlePatch: string
}
```

Hash the original compressed file with SHA-256, validate referenced files after the stream ends, and map every public failure to a stable code such as `ARCHIVE_UNSAFE_ENTRY`, `MANIFEST_INVALID`, or `PACKAGE_INCOMPLETE`.

- [ ] **Step 4: Run archive tests and verify GREEN**

Run: `corepack pnpm exec vitest run plugins/installer/tests/archive.spec.ts`

Expected: PASS with no extracted archive tree written to disk.

- [ ] **Step 5: Commit**

```bash
git add plugins/installer/src/errors.ts plugins/installer/src/archive.ts plugins/installer/src/types.ts plugins/installer/tests/archive.spec.ts
git commit -m "feat(installer): inspect plugin archives safely"
```

### Task 3: Own bounded upload sessions and confirmation state

**Files:**
- Create: `plugins/installer/src/upload-store.ts`
- Create: `plugins/installer/src/preview.ts`
- Create: `plugins/installer/tests/upload-store.spec.ts`
- Create: `plugins/installer/tests/preview.spec.ts`

**Interfaces:**
- Consumes: `inspectPluginArchive(path)` and `InspectedPlugin`.
- Produces: `UploadStore.begin`, `append`, `finish`, `cancel`, `consume`, and `dispose`.
- Produces: `classifyAction(current, candidate): InstallAction` and `diffManifest(current, candidate): ManifestDifference[]`.

- [ ] **Step 1: Write failing upload lifecycle tests**

Use a private `mkdtemp` root and fake clock/random source. Verify a 1 MiB chunk succeeds, skipped/duplicate indices fail, the Host rejects byte 100 MiB + 1, cancel/expiry/inspection failure/consume/dispose remove the file, finish makes the session immutable, and consume is single-use.

- [ ] **Step 2: Write failing preview tests**

Pin `InstallAction` to `'install' | 'upgrade' | 'downgrade' | 'reinstall'`; verify semantic-version classification, all manifest field differences, publisher changes, and that a token is bound to upload ID, archive digest, installed snapshot digest, package, and action.

- [ ] **Step 3: Run tests and verify RED**

Run: `corepack pnpm exec vitest run plugins/installer/tests/upload-store.spec.ts plugins/installer/tests/preview.spec.ts`

Expected: FAIL because the store and preview functions do not exist.

- [ ] **Step 4: Implement the store and preview domain**

Use `randomUUID()` upload IDs, `createHmac('sha256', process-local randomBytes(32))` confirmation tokens, `open(..., 'wx', 0o600)`, sequential writes, a 15-minute idle expiry, and one cleanup function used by every terminal path. Store paths privately; public snapshots contain only opaque IDs, byte counts, metadata, differences, and tokens.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `corepack pnpm exec vitest run plugins/installer/tests/upload-store.spec.ts plugins/installer/tests/preview.spec.ts`

Expected: PASS and each test's temporary directory is empty after disposal.

- [ ] **Step 6: Commit**

```bash
git add plugins/installer/src/upload-store.ts plugins/installer/src/preview.ts plugins/installer/tests
git commit -m "feat(installer): manage uploads and confirmations"
```

### Task 4: Adapt the private CLI and installed-package inventory

**Files:**
- Create: `plugins/installer/src/runtime.ts`
- Create: `plugins/installer/src/installed.ts`
- Create: `plugins/installer/src/cli-installer.ts`
- Create: `plugins/installer/tests/runtime.spec.ts`
- Create: `plugins/installer/tests/installed.spec.ts`
- Create: `plugins/installer/tests/cli-installer.spec.ts`

**Interfaces:**
- Produces: `resolvePrivateRuntime(processFacts): PrivateRuntimePaths`.
- Produces: `readInstalledPlugin(profileDir, packageName): Promise<InstalledPlugin | undefined>`.
- Produces: `installArchive(paths, dshHome, archivePath, signal?): Promise<void>`.

- [ ] **Step 1: Write failing runtime and installed-state tests**

Require verified regular files for Node and the dsh entry and a verified private `.bin/pnpm`. Test absent dependency, a valid installed YAML manifest, legacy/malformed installed metadata, and a deterministic installed snapshot digest. Never resolve a package name supplied separately from the inspected candidate.

- [ ] **Step 2: Write a failing CLI process test**

Use fake executables to capture argv/environment. Assert exact argv:

```ts
[cli, 'plugin', '--profile', 'web', 'add', '--ignore-scripts', archivePath]
```

Assert PATH begins with private Node and package-bin directories, `DSH_HOME` is explicit, output is capped, abort terminates the child, nonzero exit maps to `INSTALL_FAILED`, and no host Node/npm/pnpm/dsh lookup is possible.

- [ ] **Step 3: Run tests and verify RED**

Run: `corepack pnpm exec vitest run plugins/installer/tests/runtime.spec.ts plugins/installer/tests/installed.spec.ts plugins/installer/tests/cli-installer.spec.ts`

Expected: FAIL because the adapters do not exist.

- [ ] **Step 4: Implement minimal adapters**

Derive the current dsh entry from the verified packaged process entry and its known `runtime/app/node_modules/@deepseek-ai/dsh/lib/bin.js` layout; derive Node and `.bin` as siblings within the same runtime root. Read only `$DSH_HOME/profiles/web/package.json` and the dependency's installed manifests. Spawn with `NODE_PATH` and `NODE_OPTIONS` cleared, a bounded inherited OS utility path after private entries, and 64 KiB total diagnostic capture. Return only sanitized `InstallerError` messages.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `corepack pnpm exec vitest run plugins/installer/tests/runtime.spec.ts plugins/installer/tests/installed.spec.ts plugins/installer/tests/cli-installer.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/installer/src/runtime.ts plugins/installer/src/installed.ts plugins/installer/src/cli-installer.ts plugins/installer/tests
git commit -m "feat(installer): call private dsh installer"
```

### Task 5: Expose the Host Remote and empty settings namespace

**Files:**
- Create: `plugins/installer/src/remote-types.ts`
- Create: `plugins/installer/src/index.ts`
- Create: `plugins/installer/tests/remote.spec.ts`
- Create: `plugins/installer/scripts/generate-typert.mjs`
- Create: `plugins/installer/tsconfig.build.json`

**Interfaces:**
- Consumes: Tasks 2–4 services.
- Produces: Typert namespace `pluginInstaller` with `begin`, `append`, `inspect`, `cancel`, and `confirm` methods.
- Produces: empty Host settings namespace `pluginInstaller`.

- [ ] **Step 1: Write failing Remote contract tests**

Exercise the service through an injected fake store/inventory/installer. Verify begin returns only ID/limits; append accepts `{ uploadId, index, bytes: Uint8Array }`; inspect returns manifest/current/differences/action/token; confirm rejects `confirmed: false`, changed installed-state digest, reused token, and mismatched upload; only a valid confirm calls the installer once; disposal cancels live work.

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm exec vitest run plugins/installer/tests/remote.spec.ts`

Expected: FAIL because `PluginInstallerRemote` does not exist.

- [ ] **Step 3: Implement the Remote orchestration**

Define JSON/binary-safe request/response types and decorated methods:

```ts
@Remote('begin') begin(request: BeginUploadRequest): BeginUploadResult
@Remote('append') append(request: AppendChunkRequest): Promise<UploadProgress>
@Remote('inspect') inspect(request: InspectUploadRequest): Promise<InstallPreview>
@Remote('cancel') cancel(request: CancelUploadRequest): Promise<{ cancelled: true }>
@Remote('confirm') confirm(request: ConfirmInstallRequest, signal: AbortSignal): Promise<InstallResult>
```

Register `settings.register('pluginInstaller', z.object({}), { applies: 'restart', base: {} })` inside `ctx.inject(['settings'], ...)`. Guard all responses with a `toPublicInstallerError` mapper.

- [ ] **Step 4: Generate Typert artifacts and run tests**

Run: `corepack pnpm --dir plugins/installer run build:typert`

Run: `corepack pnpm exec vitest run plugins/installer/tests/remote.spec.ts`

Expected: generated Host and Client Remote descriptors type-check and tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/installer/src plugins/installer/tests/remote.spec.ts plugins/installer/scripts plugins/installer/tsconfig.build.json plugins/installer/lib/typert*
git commit -m "feat(installer): expose install remote"
```

### Task 6: Build the last Plugin-list card

**Files:**
- Create: `plugins/installer/src/client/index.tsx`
- Create: `plugins/installer/src/client/InstallerCard.tsx`
- Create: `plugins/installer/src/client/controller.ts`
- Create: `plugins/installer/src/client/locales.ts`
- Create: `plugins/installer/src/client/card-css.ts`
- Create: `plugins/installer/src/client/slot-options.ts`
- Create: `plugins/installer/tests/client-controller.spec.ts`
- Create: `plugins/installer/tests/client-card.spec.tsx`
- Create: `plugins/installer/tsdown.config.ts`

**Interfaces:**
- Consumes: generated `ctx.remote.pluginInstaller` from Task 5.
- Produces: `settings.plugin.item` contribution keyed by `pluginInstaller`.

- [ ] **Step 1: Write failing controller tests**

Test one-file `.tgz` acceptance, wrong suffix/multiple/oversize rejection before Remote use, exact 1 MiB chunk order, progress, cancellation, preview, install/upgrade/downgrade/reinstall confirmation wording, publisher-change warning, retry, and the terminal restart instruction.

- [ ] **Step 2: Write failing accessible card tests**

Using jsdom and React test utilities, assert the drop zone is keyboard reachable, file input accepts `.tgz`, drag-over state is announced, progress uses `role="progressbar"`, validation/errors use status/alert roles, every manifest field and old→new difference renders, and confirm is disabled while busy.

- [ ] **Step 3: Run Client tests and verify RED**

Run: `corepack pnpm exec vitest run plugins/installer/tests/client-controller.spec.ts plugins/installer/tests/client-card.spec.tsx`

Expected: FAIL because the controller and card do not exist.

- [ ] **Step 4: Implement controller and card**

Keep file reading, Remote sequencing, and state transitions in `InstallerCardController`; keep rendering and browser events in `InstallerCard`. Register zh/en dictionaries and this exact slot key:

```ts
export const INSTALLER_CARD_SLOT_OPTIONS = {
  name: 'settings.plugin.item' as const,
  key: 'pluginInstaller',
  locale: 'settings.plugins.installer' as const,
}
```

Render a semantic `<li>` matching existing plugin-card spacing. Use warning treatment only for downgrade, reinstall, and publisher changes. Use `globalThis.confirm` for the explicit second confirmation after the full in-card preview.

- [ ] **Step 5: Build Client bundle and run tests**

Run: `corepack pnpm --dir plugins/installer run build:client`

Run: `corepack pnpm exec vitest run plugins/installer/tests/client-controller.spec.ts plugins/installer/tests/client-card.spec.tsx`

Expected: PASS and `lib/client.js` contains no cross-plugin runtime import.

- [ ] **Step 6: Commit**

```bash
git add plugins/installer/src/client plugins/installer/tests/client* plugins/installer/tsdown.config.ts plugins/installer/lib/client.js
git commit -m "feat(installer): add plugin-list install card"
```

### Task 7: Package and compose the installer last

**Files:**
- Create: `plugins/installer/package.json`
- Create: `plugins/installer/dsh.plugin.yml`
- Create: `plugins/installer/cordis.patch.yml`
- Create: `plugins/installer/README.md`
- Create: `plugins/installer/LICENSE`
- Create: `plugins/installer/tsconfig.json`
- Create: `plugins/installer/tests/package.spec.ts`
- Modify: `package.json`
- Modify: `Makefile`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/stage-runtime.spec.ts`

**Interfaces:**
- Produces: `plugins/installer/dsh-plugin-installer-<version>.tgz`.
- Produces: Desktop runtime dependency and Web bundle layer ordered after mail/WeCom cards.

- [ ] **Step 1: Write failing release-package and composition tests**

Assert the archive contains host/client/Typert artifacts, YAML manifest, patch, README, and license; production dependencies include `tar-stream` and `yaml`; no source files or local specs ship. Extend Desktop staging tests to require the installer workspace package and add a composition assertion that the installer bundle is the last optional private layer.

- [ ] **Step 2: Run tests and verify RED**

Run: `corepack pnpm exec vitest run plugins/installer/tests/package.spec.ts apps/desktop/scripts/stage-runtime.spec.ts`

Expected: FAIL because the package and Desktop dependency do not exist.

- [ ] **Step 3: Add package, patch, build scripts, and release commands**

Set package name `dsh-plugin-installer`, include `dsh.plugin.manifest`, `dsh.bundle.patch`, and the same Web Client injection contract as mail/WeCom. Its patch inserts Host row `plugin-installer` after other private plugin rows. Add root scripts `installer:build`, `installer:test`, and `installer:pack`; extend Make's supported `PLUGIN` values and derive the archive name from the manifest.

- [ ] **Step 4: Refresh lock state and build the archive**

Run: `corepack pnpm install --lockfile-only --no-frozen-lockfile`

Run: `corepack pnpm installer:test && corepack pnpm installer:build && corepack pnpm installer:pack`

Expected: PASS and the production archive is self-contained.

- [ ] **Step 5: Run package and staging tests**

Run: `corepack pnpm exec vitest run plugins/installer/tests/package.spec.ts apps/desktop/scripts/stage-runtime.spec.ts`

Run: `corepack pnpm verify:upstream`

Expected: PASS; upstream status remains clean.

- [ ] **Step 6: Commit**

```bash
git add plugins/installer package.json Makefile pnpm-lock.yaml apps/desktop/package.json apps/desktop/scripts/stage-runtime.spec.ts
git commit -m "build(installer): package desktop installer plugin"
```

### Task 8: Prove release-shaped installation and complete documentation

**Files:**
- Create: `apps/desktop/tests/plugin-installer.e2e.ts`
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/tests/plugin-install.e2e.ts`
- Modify: `apps/desktop/README.md`
- Modify: `apps/desktop/README.zh.md`
- Modify: `README.md`
- Modify: `README.zh.md`

**Interfaces:**
- Consumes: packaged installer, mail, private Node/dsh/pnpm runtime, and a fresh temporary `DSH_HOME`.
- Produces: `test:plugin-installer`, the release acceptance gate.

- [ ] **Step 1: Write the failing end-to-end acceptance test**

Boot a fresh Web profile containing the installer and drive its Host orchestration with a packed mail fixture. Assert preview fields, first install, profile dependency/bundle reconciliation, manual-restart result, restart and load, then pack a higher mail version and prove update requires and consumes confirmation. Add negative fixtures for publisher change and install-script execution; prove the script marker is never created.

- [ ] **Step 2: Run e2e and verify RED**

Run: `corepack pnpm --dir apps/desktop test:plugin-installer`

Expected: FAIL until the new test script and complete runtime package are wired.

- [ ] **Step 3: Add the release gate and documentation**

Add `test:plugin-installer` after the existing packaged-plugin install gate and before Tauri build. Document `.tgz` only, YAML fields, 100 MiB upload limit, explicit update/downgrade/reinstall confirmation, ignored lifecycle scripts, loopback-only control, and manual restart.

- [ ] **Step 4: Run focused and full verification**

Run: `corepack pnpm installer:test`

Run: `corepack pnpm --dir apps/desktop test:plugin-installer`

Run: `corepack pnpm --dir apps/desktop test`

Run: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests`

Run: `corepack pnpm verify:upstream`

Run: `git diff --check`

Expected: every command exits zero; the malicious lifecycle-script marker is absent; `git -C upstream status --short` is empty.

- [ ] **Step 5: Reconcile project knowledge**

Record only verified relations: Client `apply` registers the final `settings.plugin.item`; Client controller calls `PluginInstallerRemote`; Remote calls `UploadStore`, installed inventory, and CLI adapter; CLI adapter invokes private dsh; Desktop staging depends on `dsh-plugin-installer`. Run project-knowledge `validate` and re-inspect any stale evidence touched by this implementation.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop README.md README.zh.md .project-knowledge
git commit -m "test(installer): gate drag package installation"
```

### Task 9: Final review and release audit

**Files:**
- Review: all files changed in Tasks 1–8

**Interfaces:**
- Consumes: the complete feature and its verification evidence.
- Produces: a review-ready branch with no untracked archives or temporary files.

- [ ] **Step 1: Run the complete verification commands again from a clean process**

Run the six commands in Task 8 Step 4 without reusing watch processes or cached dev servers. Capture exact exit results for handoff.

- [ ] **Step 2: Inspect the actual packed artifacts**

List mail, WeCom, and installer tar entries; parse each YAML manifest from its archive; verify root package identity matches; verify no `src`, test, credential, local path, or generated temporary file ships.

- [ ] **Step 3: Request code review**

Use the `requesting-code-review` skill against the design document and this plan. Resolve findings through `receiving-code-review`; rerun the affected focused test and the complete verification set after any code change.

- [ ] **Step 4: Finish the development branch**

Use `verification-before-completion`, then `finishing-a-development-branch` to present merge/integration choices. Do not claim completion from earlier test output.
