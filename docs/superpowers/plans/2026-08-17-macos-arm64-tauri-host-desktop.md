# macOS arm64 Tauri Host Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent Tauri wrapper that directly runs the existing built DeepSeek Harness Web profile with a bundled Node.js arm64 runtime.

**Architecture:** `apps/desktop` is additive and does not modify existing Harness, CLI, Web UI, or package source. Its Rust host starts `@deepseek-ai/dsh/lib/bin.js --profile web --port 0`, parses the existing loopback URL, loads it in the Tauri WebView, and owns child shutdown; packaging stages the existing production dependency graph and Node.js runtime as resources.

**Tech Stack:** Tauri 2, Rust 2024 edition, Node.js 24, pnpm 11.7.0, existing DeepSeek Harness Web build.

## Global Constraints

The MVP targets `aarch64-apple-darwin` and produces unsigned artifacts.

Existing files outside `apps/desktop` and these planning documents must not change.

The wrapper adds no authentication, transport protection, Computer capability, VM, or alternate UI.

The packaged application must not discover host Node.js, npm, pnpm, Python, or Homebrew.

---

### Task 1: Rust lifecycle library

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src-tauri/Cargo.toml`
- Create: `apps/desktop/src-tauri/build.rs`
- Create: `apps/desktop/src-tauri/src/lifecycle.rs`
- Create: `apps/desktop/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: absolute bundled Node path, built CLI path, DSH home, bounded startup and shutdown durations.
- Produces: `parse_web_url`, `ServerProcess::start`, `ServerProcess::origin`, and `ServerProcess::shutdown`.

- [ ] Write Rust tests for exact loopback URL parsing, malformed/non-loopback rejection, early child exit, startup timeout, graceful SIGTERM, and forced process-group termination.
- [ ] Run `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` and confirm RED because the lifecycle API is absent.
- [ ] Implement the smallest lifecycle state machine that starts bundled Node with `[cli, "--profile", "web", "--port", "0"]`, parses bounded stdout, probes the reported origin, and owns the macOS child process group.
- [ ] Run the same Cargo test command and confirm GREEN.
- [ ] Commit with `git commit -m "feat: add desktop server lifecycle"`.

### Task 2: Tauri shell over the existing Web UI

**Files:**
- Create: `apps/desktop/src-tauri/src/main.rs`
- Create: `apps/desktop/src-tauri/tauri.conf.json`
- Create: `apps/desktop/src-tauri/capabilities/default.json`
- Create: `apps/desktop/index.html`
- Create: `apps/desktop/src/error.ts`
- Create: `apps/desktop/src/error.spec.ts`

**Interfaces:**
- Consumes: Task 1 lifecycle API.
- Produces: one Tauri window that navigates to the owned Harness origin or shows a bounded startup error.

- [ ] Write failing TypeScript and Rust tests for diagnostic truncation, one navigation, no duplicate child, and shutdown on application exit.
- [ ] Run `pnpm exec vitest run apps/desktop/src/error.spec.ts` and the Cargo tests; confirm RED.
- [ ] Implement Tauri setup, hidden-until-ready navigation, bounded error display, and one asynchronous exit cleanup path.
- [ ] Run the focused TypeScript and Cargo tests; confirm GREEN.
- [ ] Commit with `git commit -m "feat: add tauri harness shell"`.

### Task 3: Bundled Node and production runtime staging

**Files:**
- Create: `apps/desktop/runtime.json`
- Create: `apps/desktop/scripts/stage-runtime.ts`
- Create: `apps/desktop/scripts/stage-runtime.spec.ts`
- Create: `apps/desktop/scripts/audit-runtime.ts`
- Create: `apps/desktop/scripts/audit-runtime.spec.ts`
- Create: `apps/desktop/.gitignore`

**Interfaces:**
- Consumes: official `node-v24.7.0-darwin-arm64.tar.gz`, its official `SHASUMS256.txt`, and the existing workspace production build.
- Produces: `src-tauri/resources/runtime/node/bin/node` and a pnpm-deployed `src-tauri/resources/runtime/app` containing `@deepseek-ai/dsh` and the Web assets.

- [ ] Write failing fixture tests for checksum mismatch, wrong Node architecture, missing CLI/Web artifacts, source imports, `tsx`, pnpm-store references, and development-machine absolute paths.
- [ ] Run the focused Vitest files and confirm RED.
- [ ] Implement atomic staging with explicit archive/checksum inputs and `pnpm --filter @deepseek-ai/dsh-desktop deploy --prod`.
- [ ] Implement an audit that executes the staged Node for `process.arch`, resolves the built CLI and Web assets, and scans production text files for forbidden development references.
- [ ] Run the focused tests and confirm GREEN.
- [ ] Commit with `git commit -m "build: stage desktop runtime"`.

### Task 4: Artifact build, audit, and documentation

**Files:**
- Create: `apps/desktop/scripts/audit-app.ts`
- Create: `apps/desktop/scripts/audit-app.spec.ts`
- Create: `apps/desktop/README.md`
- Create: `apps/desktop/README.zh.md`
- Create: `apps/desktop/README.i18n.yaml`
- Create: `apps/desktop/icons/icon.png`
- Create: `apps/desktop/icons/icon.icns`

**Interfaces:**
- Consumes: Tasks 1–3 and the existing `apps/web/public/favicon.svg`.
- Produces: unsigned arm64 `.app`/`.dmg`, packaged-resource audit, and contributor instructions.

- [ ] Write a failing fixture test that rejects absent resources and non-arm64 Mach-O files.
- [ ] Implement final `.app` auditing with `lipo -archs`, runtime re-audit, and required-resource checks.
- [ ] Generate icons from the existing favicon and configure `tauri build --target aarch64-apple-darwin` in `apps/desktop/package.json`.
- [ ] Document staging, development, build, artifact paths, unsigned installation, and the explicit absence of added authentication or isolation.
- [ ] Run `pnpm run build`, all `apps/desktop` Vitest tests, Cargo tests, Desktop runtime audit, Tauri build, app audit, `pnpm run doc-sync`, and `git diff --check`.
- [ ] Commit with `git commit -m "build: package macos harness desktop"`.
