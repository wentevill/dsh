# WeCom Make Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `PLUGIN=wecom` support to the root Makefile's pack and Desktop install targets.

**Architecture:** Keep Make as a selector over plugin-owned npm pack scripts. Select package name, version, archive path, and root package script from the supported `PLUGIN` value; the existing bundled Desktop CLI remains the sole installer.

**Tech Stack:** GNU Make, pnpm package scripts, Vitest, npm package archives.

## Global Constraints

- `PLUGIN=mail` remains the default.
- Supported plugin values are exactly `mail` and `wecom`.
- WeCom archives are named `dsh-wecom-<version>.tgz`.
- Installation uses one `dsh plugin --profile <profile> add <archive>` call.

---

### Task 1: Select and pack either plugin

**Files:**
- Modify: `packaging/makefile.spec.ts`
- Modify: `Makefile`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PLUGIN`, `PROFILE`, and each plugin's `package.json` version.
- Produces: `make pack-plugin PLUGIN=wecom` and a selected `PLUGIN_ARCHIVE` used by `install-plugin`.

- [ ] **Step 1: Write failing Make dry-run tests**

Add assertions that `make -n pack-plugin PLUGIN=wecom` emits `corepack pnpm wecom:pack`, that `make -n install-plugin PLUGIN=wecom` references `plugins/wecom/dsh-wecom-0.1.0.tgz`, and that the supported-list diagnostic names `mail wecom`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `corepack pnpm vitest run packaging/makefile.spec.ts`

Expected: failure because `PLUGIN=wecom` is currently rejected.

- [ ] **Step 3: Implement the selector and package script**

Add `wecom:pack` to root `package.json`. In `Makefile`, branch on `PLUGIN` to select `mail:pack`/`wecom:pack`, `dsh-mail`/`dsh-wecom`, and the matching package directory/version. Keep the existing unsupported-value parse-time error.

- [ ] **Step 4: Run focused and full tests**

Run: `corepack pnpm vitest run packaging/makefile.spec.ts`

Run: `corepack pnpm test`

Expected: all tests pass.

- [ ] **Step 5: Run the real package target**

Run: `make pack-plugin PLUGIN=wecom`

Expected: `plugins/wecom/dsh-wecom-0.1.0.tgz` exists and `tar -tzf` lists `package/package.json`, `package/lib/index.js`, `package/lib/client.js`, and `package/cordis.patch.yml`.

- [ ] **Step 6: Commit**

```bash
git add Makefile package.json packaging/makefile.spec.ts plugins/wecom/dsh-wecom-0.1.0.tgz
git commit -m "feat(wecom): add Make packaging commands"
```
