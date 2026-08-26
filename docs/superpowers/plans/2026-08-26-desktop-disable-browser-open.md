# Desktop Disable Browser Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure launching DeepSeek Harness Desktop never opens the system browser while preserving direct `dsh web` behavior.

**Architecture:** Keep the upstream Web profile unchanged and suppress its browser handoff at the Desktop process boundary. The Rust lifecycle launcher will pass the upstream-supported `--no-open` flag to its bundled DSH child process.

**Tech Stack:** Rust, Tauri, Cargo integration tests, pnpm Desktop packaging

## Global Constraints

- Desktop startup must never proactively open the system browser.
- The Tauri window must continue loading the loopback Web runtime.
- Direct CLI `dsh web` startup behavior must remain unchanged.
- Do not alter readiness, process-group, or shutdown behavior.

---

### Task 1: Suppress Browser Handoff at the Desktop Launcher Boundary

**Files:**
- Modify: `apps/desktop/src-tauri/tests/lifecycle.rs`
- Modify: `apps/desktop/src-tauri/src/lifecycle.rs`

**Interfaces:**
- Consumes: `ServerProcess::start(StartSpec) -> Result<ServerProcess, StartError>`
- Produces: bundled CLI invocation arguments `--profile web --port 0 --no-open`

- [ ] **Step 1: Write the failing behavior test**

Add a fixture CLI script that writes its received arguments to a temporary file, reports a ready loopback URL, and stays alive. Start it through `ServerProcess::start`, read the captured arguments, and assert the literal sequence:

```rust
assert_eq!(arguments, "--profile\nweb\n--port\n0\n--no-open\n");
```

This test catches removal of `--no-open`, which would re-enable upstream's browser handoff.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml desktop_child_disables_browser_open
```

Expected: FAIL because the captured arguments end after `0` and omit `--no-open`.

- [ ] **Step 3: Implement the minimal fix**

Change the Desktop child arguments in `ServerProcess::start` to:

```rust
.args(["--profile", "web", "--port", "0", "--no-open"])
```

- [ ] **Step 4: Verify GREEN and lifecycle regression coverage**

Run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: all Rust tests pass.

- [ ] **Step 5: Build and audit the Desktop image**

Run:

```bash
corepack pnpm desktop:build
```

Expected: Desktop app build, DMG packaging, and audit complete successfully.

- [ ] **Step 6: Record architecture knowledge and inspect the final diff**

Reconcile the verified Desktop launcher-to-bundled-Web-runtime relationship, validate the ledger, run `git diff --check`, and confirm no unrelated user changes were included.
