# Nextcloud Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public-link, user, and group sharing to the existing `dsh-nextcloud` plugin with read/edit/File Drop profiles and fresh approval for every mutation.

**Architecture:** Extend the existing authenticated transport with a focused OCS request port and keep share parsing in `sharing-transport.ts`. Compose the existing path policy with a `NextcloudSharingService`, then register read and mutation tools through the existing tool manager and approval policy.

**Tech Stack:** TypeScript, Nextcloud OCS Share API, WebDAV metadata, Zod/Schemastery tool schemas, Vitest.

## Global Constraints

- Remain one `dsh-nextcloud` plugin and one tgz.
- Support public-link, user, and group targets.
- Support `read`, `edit`, and public-directory-only `fileDrop` profiles.
- Never return, log, fingerprint, or display share passwords.
- Require fresh approval for create, update, and revoke.
- Enforce the existing all-directories/allowlist path policy.
- Bound list/search results to 100 and report truncation.

---

### Task 1: OCS sharing protocol

**Files:**
- Create: `plugins/nextcloud/src/sharing-types.ts`
- Create: `plugins/nextcloud/src/sharing-transport.ts`
- Modify: `plugins/nextcloud/src/transport.ts`
- Test: `plugins/nextcloud/tests/sharing-transport.spec.ts`

**Interfaces:**
- Produces: `NextcloudSharingTransport` with `listShares`, `getShare`, `searchSharees`, `createShare`, `updateShare`, and `deleteShare`.
- Produces: redacted `NextcloudShare` and `NextcloudSharee` types.

- [ ] Write protocol tests using a fake request adapter for OCS headers, endpoints, form values, response parsing, and meta-status errors.
- [ ] Run the focused test and observe missing-module failure.
- [ ] Implement permission constants, OCS JSON parsing, request construction, redaction, and bounded raw results.
- [ ] Run the focused test and observe all protocol cases pass.

### Task 2: Sharing service and validation

**Files:**
- Create: `plugins/nextcloud/src/sharing-service.ts`
- Modify: `plugins/nextcloud/src/service.ts`
- Test: `plugins/nextcloud/tests/sharing-service.spec.ts`

**Interfaces:**
- Consumes: `NextcloudSharingTransport` and existing `NextcloudFileService` path/stat validation.
- Produces: normalized create/update inputs and safe read operations.

- [ ] Write service tests for allowlist enforcement, exact date validation, share target validation, result truncation, and File Drop directory-only rules.
- [ ] Run the focused test and observe missing-service failure.
- [ ] Implement the smallest service satisfying those tests without exposing passwords in results.
- [ ] Run the focused test and observe all validation cases pass.

### Task 3: Sharing tools and fresh approval

**Files:**
- Modify: `plugins/nextcloud/src/host.ts`
- Modify: `plugins/nextcloud/src/tools.ts`
- Modify: `plugins/nextcloud/src/index.ts`
- Test: `plugins/nextcloud/tests/sharing-tools.spec.ts`

**Interfaces:**
- Consumes: sharing service created from the same settings and credential snapshot as file tools.
- Produces: `nextcloud_share_list`, `nextcloud_share_get`, `nextcloud_sharee_search`, `nextcloud_share_create`, `nextcloud_share_update`, and `nextcloud_share_delete`.

- [ ] Write tool tests proving read tools execute directly and all mutation tools ask with normalized, password-redacted reasons.
- [ ] Run the focused test and observe missing tool registrations.
- [ ] Extend the service snapshot and approval binding with sharing operations and stale-share checks.
- [ ] Run the focused test and observe all approval cases pass.

### Task 4: Live coverage, documentation, and package

**Files:**
- Modify: `plugins/nextcloud/tests/live-nextcloud.spec.ts`
- Modify: `plugins/nextcloud/README.md`
- Modify: `README.md`
- Modify: `README.zh.md`

**Interfaces:**
- Produces: documented sharing tools and optional read-only live share tests.

- [ ] Add an opt-in read-only live share-list assertion; mutations remain disabled without a dedicated flag.
- [ ] Document target types, permission profiles, approval behavior, and secret handling.
- [ ] Run `CI=true corepack pnpm --dir plugins/nextcloud test` and require all local tests to pass.
- [ ] Run `CI=true corepack pnpm --dir plugins/nextcloud run build` and require exit code 0.
- [ ] Run `CI=true make pack-plugin PLUGIN=nextcloud` and inspect the resulting tgz.
