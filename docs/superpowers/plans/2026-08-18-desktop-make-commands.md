# Desktop Make Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide root Make targets for release DMG creation, Tauri development, mail plugin packaging, and one-command installation into the installed Desktop profile.

**Architecture:** Add a thin root `Makefile` that delegates release, development, and packaging to existing pnpm scripts. The install target alone composes the installed app's private runtime paths and explicit Desktop `DSH_HOME`, then forwards one plugin-add operation to bundled dsh.

**Tech Stack:** GNU/BSD Make, zsh/POSIX shell recipes, pnpm, Vitest, Tauri 2.

## Global Constraints

- Do not modify the upstream source checkout.
- Do not use host-installed Node, dsh, or pnpm for plugin installation.
- Support only `PLUGIN=mail` in this MVP.
- Preserve spaces in application and data paths.
- Do not automatically start or stop the installed application.

---

### Task 1: Make command contract

**Files:**
- Create: `packaging/makefile.spec.ts`
- Create: `Makefile`

**Interfaces:**
- Consumes: root `package.json` scripts `desktop:build` and `mail:pack`; Desktop package script `dev`.
- Produces: Make targets `help`, `release-dmg`, `run`, `pack-plugin`, and `install-plugin`.

- [ ] **Step 1: Write the failing command-expansion tests**

Create `packaging/makefile.spec.ts` using `execFileSync('make', ['-n', target, ...overrides])`. Assert literal expanded commands for release, development, plugin packaging, Desktop `DSH_HOME`, installed app runtime paths, and `plugin --profile web add`. Add an unsupported-plugin invocation and assert nonzero failure.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm vitest run packaging/makefile.spec.ts`

Expected: FAIL because the root `Makefile` does not exist.

- [ ] **Step 3: Implement the Makefile**

Create `.PHONY` targets with these variables:

```make
APP_PATH ?= /Applications/DeepSeek Harness.app
PLUGIN ?= mail
PROFILE ?= web
DESKTOP_DSH_HOME ?= $(HOME)/Library/Application Support/ai.deepseek.harness/harness
```

Delegate `release-dmg`, `run`, and `pack-plugin` to the approved commands. In `install-plugin`, validate supported plugin and required artifacts, quote every path, construct private `PATH`, set `DSH_HOME`, and execute the bundled dsh plugin-add command once.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `corepack pnpm vitest run packaging/makefile.spec.ts`

Expected: PASS.

- [ ] **Step 5: Run the real packaging target**

Run: `make pack-plugin`

Expected: `plugins/mail/dsh-mail-plugin-0.1.0.tgz` is created and the existing package-content test passes.

- [ ] **Step 6: Commit**

```bash
git add Makefile packaging/makefile.spec.ts
git commit -m "add desktop make commands"
```

### Task 2: Documentation and full verification

**Files:**
- Modify: `README.md`
- Modify: `README.zh.md`

**Interfaces:**
- Consumes: Make targets from Task 1.
- Produces: concise operator instructions, including the requirement to quit the installed Desktop app before plugin installation.

- [ ] **Step 1: Document exact commands**

Add a short section listing `make release-dmg`, `make run`, `make pack-plugin`, and `make install-plugin`, plus overridable variables and the quit-before-install constraint.

- [ ] **Step 2: Run all packaging and Desktop unit tests**

Run: `corepack pnpm test && corepack pnpm desktop:test && corepack pnpm mail:test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Verify Make expansion and workspace cleanliness**

Run: `make -n install-plugin && git diff --check`

Expected: one bundled dsh plugin-add command and no whitespace errors.

- [ ] **Step 4: Commit**

```bash
git add README.md README.zh.md
git commit -m "document desktop make commands"
```
