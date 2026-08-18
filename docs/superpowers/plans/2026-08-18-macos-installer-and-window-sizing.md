# macOS Installer and Window Sizing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Present a conventional macOS drag-install DMG and open the desktop app in a centered 1152-by-720 normal window.

**Architecture:** Extend the existing native hdiutil pipeline with a writable-image Finder-customization phase, then convert it to the current read-only UDZO deliverable. Keep initial window geometry in a pure Rust specification consumed by the Tauri entry point.

**Tech Stack:** TypeScript, Node.js, Vitest, hdiutil, Finder AppleScript, sips, Rust, Tauri 2, Cargo.

## Global Constraints

- Finder window: 660 by 400 logical points.
- App and Applications icons: 128 points at (170, 190) and (490, 190).
- Startup window: 1152 by 720 logical points, centered and normally resizable.
- Packaging never writes to /Applications and retains final audit, rollback, and cleanup.
- Final DMG remains compressed read-only UDZO.
- Do not touch, stage, or commit unrelated worktree changes.

---

### Task 1: Standard Finder drag-install presentation

**Files:**
- Create: apps/desktop/assets/dmg-background.svg
- Create: apps/desktop/assets/dmg-background.png
- Create: apps/desktop/src-tauri/icons/icon.icns
- Modify: apps/desktop/scripts/package-dmg.spec.ts
- Modify: apps/desktop/scripts/package-dmg.ts
- Modify: apps/desktop/src-tauri/tauri.conf.json
- Modify: apps/desktop/tests/bundle.spec.ts

**Interfaces:**
- Consumes: prepareDmgSource and the existing packageDmg publication contract.
- Produces: DmgCommandRunner, Finder customization orchestration, background assets, and an ICNS bundle icon.

- [ ] **Step 1: Write failing packaging and bundle tests**

Add a recording command runner test that asserts UDRW creation, private read-write mounting, Finder customization containing the exact window size/icon size/icon positions, guaranteed detach, and UDZO conversion. Add a bundle test that parses tauri.conf.json, resolves configured icons, and requires an existing .icns file.

These tests catch skipped customization, swapped positions, wrong dimensions, a writable final image, and a missing macOS icon.

- [ ] **Step 2: Run focused tests and verify RED**

Run: npm --workspace @deepseek-ai/dsh-desktop test -- --run scripts/package-dmg.spec.ts tests/bundle.spec.ts

Expected: FAIL because no customization phase or ICNS declaration exists.

- [ ] **Step 3: Add deterministic installer artwork and icon assets**

Check in a 660-by-400 SVG with a neutral background and centered right arrow, render it to a same-size PNG with macOS image tooling, and generate icon.icns from the canonical transparent 512-by-512 PNG using sips. Configure Tauri with both icons/icon.png and icons/icon.icns.

- [ ] **Step 4: Implement writable-image customization**

Expose this native-command boundary:

```ts
export type DmgCommandRunner = (command: string, args: string[]) => void
```

The implementation copies the PNG to source/.background/background.png; creates a temporary UDRW image; attaches it read-write at the exact private mount; runs Finder AppleScript against that mounted folder to configure icon view, hidden chrome, 660-by-400 bounds, 128-point icons, background, and positions; closes the Finder window; synchronizes; detaches that mount in finally; converts to UDZO; then uses the existing atomic publish and audit/rollback logic. Cleanup errors must not mask the original error.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: npm --workspace @deepseek-ai/dsh-desktop test -- --run scripts/package-dmg.spec.ts tests/bundle.spec.ts

Expected: selected tests PASS.

- [ ] **Step 6: Run all Desktop TypeScript tests**

Run: npm --workspace @deepseek-ai/dsh-desktop test

Expected: all Desktop tests PASS.

- [ ] **Step 7: Commit Task 1**

Stage only the seven Task 1 paths and commit with: fix: present standard macos drag installer

---

### Task 2: Centered 13-inch-safe startup window

**Files:**
- Modify: apps/desktop/src-tauri/src/lib.rs
- Modify: apps/desktop/src-tauri/src/main.rs
- Create: apps/desktop/src-tauri/tests/window.rs

**Interfaces:**
- Consumes: monitor work-area width and height in logical points.
- Produces: WindowSpec, DEFAULT_WINDOW_SPEC, and fit_window_to_work_area.

- [ ] **Step 1: Write failing Rust behavior tests**

Test the literal default WindowSpec { width: 1152.0, height: 720.0 }, a 1024-by-680 work area clamping to 1024 by 680, and a larger work area preserving the default. These catch accidental fullscreen sizing, oversize startup, dimension swaps, and unintended enlargement.

- [ ] **Step 2: Run focused test and verify RED**

Run: cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test window

Expected: FAIL because the specification symbols do not exist.

- [ ] **Step 3: Implement the pure specification**

Add a Copy + PartialEq + Debug WindowSpec, the exact default constant, and a per-dimension min calculation. Do not add persistence or maximum-size policy.

- [ ] **Step 4: Apply it during Tauri window creation**

Before building the hidden window, read the current monitor logical size when available, clamp the desired size, pass it to WebviewWindowBuilder::inner_size, and call center before build. Preserve native resizable, maximizable, and fullscreen behavior; show only after setup.

- [ ] **Step 5: Run focused and complete Rust tests**

Run:
- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --test window
- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests

Expected: all Rust tests PASS.

- [ ] **Step 6: Compile the desktop entry point**

Run: cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --features desktop-app --bin dsh-desktop

Expected: the monitor and window builder APIs compile.

- [ ] **Step 7: Commit Task 2**

Stage only lib.rs, main.rs, and tests/window.rs and commit with: fix: enlarge macos startup window

---

### Task 3: Release verification and project-note consistency

**Files:**
- Modify if the existing note owns the behavior: .agents/notes/implemented/bug-fix/2026-08-18-tauri-runtime-bundle-closure.md
- Modify its Chinese pair and generated i18n record under the same basename.

**Interfaces:**
- Consumes: completed installer and window behavior.
- Produces: built and audited DMG plus synchronized project notes.

- [ ] **Step 1: Update both language notes**

Record the exact Finder window, icons, ICNS, and centered normal startup window. Do not create a parallel note for this desktop topic.

- [ ] **Step 2: Verify translation pairing**

Run: npm run verify-translation-pairing -- --write .agents/notes/implemented/bug-fix/2026-08-18-tauri-runtime-bundle-closure.md

Expected: pairing verification succeeds.

- [ ] **Step 3: Build and audit release**

Run: npm --workspace @deepseek-ai/dsh-desktop run build

Expected: app audit and final mounted-DMG audit succeed.

- [ ] **Step 4: Inspect the Finder presentation**

Mount the exact generated DMG without -nobrowse, confirm the large branded app icon on the left, Applications on the right, and arrow background in a 660-by-400 window, then detach only the returned device.

- [ ] **Step 5: Run final touched-scope checks**

Run:
- npm --workspace @deepseek-ai/dsh-desktop test
- cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --lib --tests
- git diff --check

Expected: all tests pass and no whitespace errors appear.

- [ ] **Step 6: Commit note updates if present**

Stage only the English note, Chinese note, and their generated i18n record; commit with: docs: record macos desktop presentation
