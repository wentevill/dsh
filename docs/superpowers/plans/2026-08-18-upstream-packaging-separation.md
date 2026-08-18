# Upstream Source and Desktop Packaging Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the outer directory into the only writable packaging project while restoring the nested GitHub checkout to pristine `origin/master` behind a stable `upstream` symlink.

**Architecture:** Preserve the current 16 commits on an archive branch, export only packaging-owned paths into the outer repository, and record hashes before resetting anything. Rename the pristine inner checkout and enforce a read-only upstream contract with tested preflight tooling. Adapt the extracted Desktop workspace without writing through the symlink.

**Tech Stack:** Git, POSIX filesystem/symlinks, TypeScript ESM, pnpm workspaces, Vitest, Tauri/Rust.

## Global Constraints

- Never force-push, delete the archive branch, or mutate a remote.
- Do not reset the inner checkout until the archive ref and extracted-file manifest verify.
- After migration, packaging commands may read `upstream` but may not install, generate, patch, reset, or build inside it.
- A dirty or unexpected upstream revision is a hard failure; tooling never repairs it automatically.
- Continue in the current outer directory as explicitly requested by the user.

---

### Task 1: Protect the source history and outer repository

**Files:**
- Create: `.gitignore`
- Create: `packaging/upstream-layout.ts`
- Test: `packaging/upstream-layout.spec.ts`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`

**Interfaces:**
- Produces: `PACKAGING_ARCHIVE_REF = "refs/heads/archive/desktop-packaging-20260818"`.
- Produces: `assertMigrationSource(sourceDir: string): { head: string; upstreamHead: string }`.

- [ ] Write a failing test that rejects the wrong current commit, missing `origin/master`, dirty inner tree, and an archive ref pointing anywhere except `2c4cf69b2f`.
- [ ] Run `corepack pnpm exec vitest run packaging/upstream-layout.spec.ts` and confirm failure because the module is absent.
- [ ] Create the archive branch in the inner repository at `2c4cf69b2f`; verify it with `git show-ref --verify`.
- [ ] Implement `assertMigrationSource` using `git -C <dir>` read-only commands and exact commit comparisons.
- [ ] Add outer `.gitignore` entries for `.DS_Store`, `.pnpm-store/`, `.project-knowledge/`, `node_modules/`, build targets, and the real `deepseek-harness-source/` directory while explicitly allowing the `upstream` symlink.
- [ ] Add a minimal private outer package manifest and workspace rooted at `apps/*`, `packages/*`, and `plugins/*`.
- [ ] Run the focused test and commit with `chore: establish packaging workspace`.

### Task 2: Extract and prove packaging-owned artifacts

**Files:**
- Create: `packaging/extract-manifest.ts`
- Test: `packaging/extract-manifest.spec.ts`
- Create: `packaging/extracted-files.sha256`
- Copy: inner archive `apps/desktop/**` to outer `apps/desktop/**`
- Copy: inner archive `packages/mail/**` to outer `packages/mail/**`
- Copy: selected archive Desktop/mail specs and plans to outer `docs/superpowers/**`

**Interfaces:**
- Produces: `buildExtractionManifest(root: string, paths: readonly string[]): string` with sorted `<sha256>  <relative-path>` records.
- Produces: `verifyExtractionManifest(root: string, manifest: string): void`.

- [ ] Write a failing test proving deterministic ordering, hash mismatch detection, missing-file detection, and rejection of symlinks escaping the packaging root.
- [ ] Run the focused test and confirm the missing module failure.
- [ ] Export tracked files from the archive ref, not from unverified working-tree contents; exclude `node_modules`, `lib`, Rust `target`, generated DMGs, and staged runtime directories.
- [ ] Implement manifest generation and verification, then write `packaging/extracted-files.sha256` covering every extracted tracked file.
- [ ] Compare outer extracted files with `git show archive/desktop-packaging-20260818:<path>` and require exact bytes.
- [ ] Run the focused test, verify the manifest, and commit with `chore: extract desktop packaging assets`.

### Task 3: Restore and rename pristine upstream

**Files:**
- Rename directory: `deepseek-harness/` to `deepseek-harness-source/`
- Create symlink: `upstream -> deepseek-harness-source`
- Create: `upstream.lock.json`

**Interfaces:**
- `upstream.lock.json` contains `{ "remote": "git@github.com:deepseek-ai/deepseek-harness.git", "revision": "47f943859b..." }` using the full `origin/master` hash.

- [ ] Verify archive ref, extraction manifest, and a clean inner tree immediately before reset.
- [ ] Reset only inner `master` to `origin/master`; verify `master == origin/master`, archive ref unchanged, and status empty.
- [ ] Rename the directory, create the relative symlink, and record the full upstream revision.
- [ ] Assert `readlink upstream` equals `deepseek-harness-source` and `git -C upstream status --porcelain` is empty.
- [ ] Commit only the symlink and lock file with `chore: pin pristine upstream source`.

### Task 4: Enforce the read-only upstream boundary

**Files:**
- Create: `packaging/assert-upstream.ts`
- Test: `packaging/assert-upstream.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `captureUpstreamState(root: string): { revision: string; status: string; trackedDigest: string }`.
- Produces: `assertUpstream(root: string): void` validating symlink, remote, locked revision, clean status, and tracked digest stability.

- [ ] Write failing tests for a non-symlink upstream, symlink escape, dirty checkout, revision mismatch, remote mismatch, and a successful pinned checkout.
- [ ] Run the focused test and confirm failure because the module is absent.
- [ ] Implement the checks without cleanup or mutation commands; calculate the digest from sorted `git ls-files -s` output plus revision.
- [ ] Add `verify:upstream` and make every outer stage/build entry begin with it.
- [ ] Run tests, run `verify:upstream`, and commit with `build: enforce read-only upstream source`.

### Task 5: Decouple extracted Desktop packaging from upstream writes

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/scripts/stage-runtime.ts`
- Modify: `apps/desktop/scripts/*.spec.ts`
- Modify: outer `package.json`
- Create: `packaging/upstream-immutability.e2e.ts`

**Interfaces:**
- Desktop staging consumes `UPSTREAM_ROOT=<outer>/upstream` and writes only under outer temporary/build directories.
- The e2e snapshot uses `captureUpstreamState` before and after install/test/stage operations.

- [ ] Write a failing e2e test that snapshots upstream, runs the Desktop runtime staging fixture, and requires identical revision, status, and tracked digest afterward.
- [ ] Run it and capture the first path assumption or upstream write.
- [ ] Replace inner-monorepo-relative packaging paths with explicit outer-root/upstream-root inputs. Copy source inputs into an outer temporary assembly tree before package deployment or sanitization.
- [ ] Remove outer dependencies on changing upstream manifests or lockfiles; no `withPreservedFile(upstream/pnpm-lock.yaml)` operation remains.
- [ ] Run existing Desktop TypeScript and Rust tests from the outer workspace plus the immutability e2e.
- [ ] Commit with `refactor(desktop): build against immutable upstream`.

### Task 6: Verify the migrated layering

**Files:**
- Modify: `README.md`
- Create: `docs/operations/upstream-update.md`

**Interfaces:**
- Documents the only supported update: explicitly change `upstream.lock.json` after reviewing a clean GitHub revision; packaging never edits upstream source.

- [ ] Document directory ownership, archive recovery, source update procedure, and forbidden writes.
- [ ] Run `corepack pnpm test`, `corepack pnpm run verify:upstream`, Desktop Rust tests, and extraction-manifest verification.
- [ ] Search built/staged packaging outputs for absolute checkout paths and escaping symlinks; require zero findings.
- [ ] Confirm archive ref remains `2c4cf69b2f`, inner master remains locked upstream, and both Git working trees contain only intended changes.
- [ ] Commit with `docs: explain immutable upstream workflow`.
