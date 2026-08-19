# WeCom Session Workspace Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every newly created WeCom Harness Session a configured, valid `cwd` so inbound messages can run an Agent turn and reply.

**Architecture:** Add one absolute workspace template to the plugin configuration. Resolve it per new Session, create the directory before Agent creation, and persist it as `meta.cwd`; existing mapped Sessions remain untouched.

**Tech Stack:** TypeScript, Cordis, Schemastery, Node.js `path`/`os`/`fs`, Vitest, pnpm.

## Global Constraints

- Default template is `<os.tmpdir()>/deepseek-harness-wecom/{{session}}`.
- Replace every `{{session}}`; without the token, reuse the configured directory.
- Configuration must be absolute.
- Existing room mappings and Sessions are not migrated or replaced.
- Plugin configuration copy is bilingual.

---

### Task 1: Workspace template contract

**Files:**
- Create: `plugins/wecom/src/session-workspace.ts`
- Create: `plugins/wecom/tests/session-workspace.spec.ts`

**Interfaces:**
- Produces: `defaultSessionWorkspaceTemplate(): string`
- Produces: `resolveSessionWorkspace(template: string, sessionId: SessionId): string`

- [ ] **Step 1: Write failing resolver tests**

Test that the default ends in `deepseek-harness-wecom/{{session}}`, all tokens are replaced, a token-free absolute path is returned unchanged, and relative paths throw.

- [ ] **Step 2: Run the focused test and observe failure**

Run: `./node_modules/.bin/vitest run tests/session-workspace.spec.ts --reporter=verbose`

- [ ] **Step 3: Implement the resolver**

Use `tmpdir()`, `join()`, `isAbsolute()`, and `template.replaceAll('{{session}}', sessionId)`; reject a non-absolute result.

- [ ] **Step 4: Run the focused test and observe success**

Run the same Vitest command and require all cases to pass.

### Task 2: Agent creation and plugin configuration

**Files:**
- Modify: `plugins/wecom/src/index.ts`
- Modify: `plugins/wecom/src/channel-host.ts`
- Modify: `plugins/wecom/src/harness-bridge.ts`
- Modify: `plugins/wecom/tests/harness-bridge.spec.ts`
- Modify: `plugins/wecom/tests/channel-host.spec.ts`

**Interfaces:**
- Consumes: `resolveSessionWorkspace(template, sessionId)`
- Produces: `createHarnessBridgeRuntime(ctx, { workspaceFor, ensureWorkspace })`

- [ ] **Step 1: Extend the failing runtime test**

Assert that `agentFor()` resolves a per-Session path, awaits recursive directory creation, then calls `ctx.agents.create()` with `meta.cwd`. Assert directory creation failure prevents `create()`.

- [ ] **Step 2: Run focused tests and observe failure**

Run: `./node_modules/.bin/vitest run tests/harness-bridge.spec.ts tests/channel-host.spec.ts --reporter=verbose`

- [ ] **Step 3: Implement runtime wiring**

Add `sessionWorkspaceTemplate` to `Config`, validate it as an absolute path, pass a resolver and `mkdir(path, { recursive: true })` into the bridge runtime, and leave `RoomSessionStore.sessionExists` behavior unchanged so existing mappings are never migrated.

- [ ] **Step 4: Run focused tests and typecheck**

Run the focused Vitest command, then `npm run build`.

### Task 3: Release and E2E

**Files:**
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/wecom/README.md`
- Modify: `plugins/wecom/tests/release-package.spec.ts`
- Generated: `plugins/wecom/lib/*`

**Interfaces:**
- Produces: installable `dsh-wecom-0.2.3.tgz`

- [ ] **Step 1: Set the release test to `0.2.3` and observe failure**

Run: `./node_modules/.bin/vitest run tests/release-package.spec.ts --reporter=verbose`.

- [ ] **Step 2: Update manifest and README**

Set package version and install example to `0.2.3`; document the template and the non-migration behavior.

- [ ] **Step 3: Verify and package**

Run all tests, build, `npm pack --ignore-scripts --cache /tmp/dsh-wecom-npm-cache --pack-destination .`, and `git diff --check`.

- [ ] **Step 4: Install and E2E**

Run `make install-plugin PLUGIN=wecom PROFILE=web`, restart one Desktop Host, verify `wecomAuth/status` is JSON-valid and connected, send one unique WeCom message, verify a newly mapped `wecom-*` Session has an absolute `cwd`, a completed Agent turn, assistant text, and a successful referenced reply.
