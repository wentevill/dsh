# Mail Package Version Make Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Desktop mail install target select the archive version declared by the mail package.

**Architecture:** `plugins/mail/package.json` remains the single source of truth for the release version. Make reads that value when resolving `PLUGIN_ARCHIVE`; the existing bundled DSH installation flow remains unchanged.

**Tech Stack:** GNU Make, Node.js, pnpm, Vitest

## Global Constraints

- Do not modify upstream DeepSeek Harness source.
- Keep installation routed through the DSH CLI bundled in the Desktop app.
- Package mail as a complete `.tgz` release artifact.

---

### Task 1: Resolve the mail archive from its manifest version

**Files:**
- Modify: `packaging/makefile.spec.ts`
- Modify: `plugins/mail/package.json`
- Modify: `Makefile`

**Interfaces:**
- Consumes: `plugins/mail/package.json#version`
- Produces: `PLUGIN_ARCHIVE` pointing to `plugins/mail/dsh-mail-plugin-<version>.tgz`

- [ ] **Step 1: Write the failing test**

Run the Makefile against a fixture manifest version and assert that the dry-run installation references the matching archive.

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm vitest run packaging/makefile.spec.ts`

Expected: FAIL because the Makefile still hardcodes `0.1.0`.

- [ ] **Step 3: Write minimal implementation**

Set the mail package version to `0.1.1`; derive `MAIL_PLUGIN_VERSION` from its manifest in Make and use it in `PLUGIN_ARCHIVE`.

- [ ] **Step 4: Run tests and package verification**

Run: `corepack pnpm vitest run packaging/makefile.spec.ts plugins/mail/tests/package.spec.ts plugins/mail/tests/settings-save.spec.ts`

Run: `make pack-plugin`

Expected: all tests pass and `plugins/mail/dsh-mail-plugin-0.1.1.tgz` is produced.

- [ ] **Step 5: Commit**

Commit the Makefile, manifest, test, and this plan without staging unrelated files.
