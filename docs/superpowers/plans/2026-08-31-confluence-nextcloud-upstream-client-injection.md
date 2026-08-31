# Confluence and Nextcloud Credential Remote Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Confluence and Nextcloud settings cards against the updated upstream credential Remote API.

**Architecture:** Activate each real client plugin against current-shape Cordis services and invoke its registered settings contribution. Replace the removed `ConnectionHandle.api.credentials` path with the generated `ctx.remote.credentials` namespace and keep credential values write-only.

**Tech Stack:** React, TypeScript, Cordis, Typert Remote, Vitest, pnpm.

## Global Constraints

- Change only `dsh-confluence` and `dsh-nextcloud` compatibility behavior.
- Do not change settings schemas, Host Remote namespaces, or persisted configuration.
- Keep credential values write-only.
- Preserve all unrelated working-tree changes.

---

### Task 1: Reproduce current-connection card rendering

**Files:**
- Create: `plugins/confluence/tests/client-activation.spec.ts`
- Create: `plugins/nextcloud/tests/client-activation.spec.ts`
- Modify: `plugins/confluence/src/client/index.tsx`
- Modify: `plugins/nextcloud/src/client/index.tsx`

**Interfaces:**
- Consumes: `ctx.remote.credentials` and `settings.plugin.item`, without the obsolete connection service.
- Produces: renderable Confluence and Nextcloud slot contributions.

- [x] Write activation tests that provide current Cordis services, capture each registered contribution, and invoke it.
- [x] Run both tests and observe `Cannot read properties of undefined (reading 'credentials')`.
- [x] Pass `child.remote.credentials` to each card and inject `remote.credentials` instead of `connection`.
- [x] Run both focused tests and observe them pass.

### Task 2: Migrate credential writes

**Files:**
- Modify: `plugins/confluence/src/client/index.tsx`
- Modify: `plugins/nextcloud/src/client/index.tsx`
- Test: `plugins/confluence/tests/client-activation.spec.ts`
- Test: `plugins/nextcloud/tests/client-activation.spec.ts`

**Interfaces:**
- Consumes: `credentials.set(ref: string, value: string)` returning a Remote result.
- Produces: `storeConfluenceCredential(...)` and `storeNextcloudCredential(...)`.

- [x] Add tests that require positional credential writes and observe the missing helpers fail.
- [x] Implement the two helpers using the plugins' existing Remote-result unwrappers.
- [x] Route card save operations through the helpers.
- [x] Run both focused tests and observe them pass.

### Task 3: Build and regression verification

**Files:**
- Update generated client bundles under `plugins/confluence/lib/` and `plugins/nextcloud/lib/`.

**Interfaces:**
- Consumes: the migrated browser client sources.
- Produces: publishable plugins compatible with the pinned upstream runtime.

- [x] Build both plugins.
- [x] Run both complete plugin suites.
- [x] Pack both plugins into temporary directories and verify `package/lib/client.js`.
- [x] Run scoped diff and whitespace checks without absorbing unrelated user changes.
- [ ] Request independent review and address Critical or Important findings.
