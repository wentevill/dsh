# WeCom Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standard installable `dsh-wecom` plugin that wraps bundled `wecom-cli`, authenticates by QR code in Plugin configuration, dynamically registers discovered enterprise APIs, and removes credentials on user confirmation.

**Architecture:** A Host plugin owns an injected process transport, authorization state machine, schema discovery, dynamic tool registrations, and fixed Typert Remote methods. A Client plugin mounts a Plugins settings card that renders unauthorized, QR-waiting, authorized, sync-failed, and deleting states; the model never receives authentication operations or credentials.

**Tech Stack:** TypeScript 6, Vitest 4, Cordis plugins, DeepSeek Harness `tools`, `settings`, `commands`, Typert Remote, React client slots, `@wecom/cli`, pnpm production `.tgz` packaging.

## Global Constraints

- Use Node.js `>=24`, ESM, strict TypeScript, and package name `dsh-wecom`.
- Bundle `@wecom/cli`; never depend on a globally installed executable.
- Execute the CLI with executable plus argument array, never shell interpolation.
- Keep Bot Secret, access tokens, encryption keys, and credential paths out of settings, logs, session events, tool args, and Remote responses.
- Scope `WECOM_CLI_CONFIG_DIR` to the active DSH profile and allow deletion only of exact plugin-owned credential/cache files.
- Do not register model-facing business tools until authorization and a complete schema refresh succeed.
- Unknown or unclassified remote methods require high-risk approval.
- Follow RED-GREEN-REFACTOR for every production behavior.

---

### Task 1: Package scaffold and deterministic CLI transport

**Files:**
- Create: `plugins/wecom/package.json`
- Create: `plugins/wecom/tsconfig.json`
- Create: `plugins/wecom/tsconfig.build.json`
- Create: `plugins/wecom/vitest.config.ts`
- Create: `plugins/wecom/src/transport.ts`
- Create: `plugins/wecom/tests/transport.spec.ts`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`

**Interfaces:**
- Produces: `WeComProcessRunner.run(request: WeComRunRequest): Promise<WeComRunResult>`.
- Produces: `WeComRunRequest { readonly path: readonly string[]; readonly body?: unknown; readonly signal?: AbortSignal; readonly timeoutMs?: number }`.
- Produces: `WeComRunResult { readonly value: JsonValue; readonly stderr: string }`.

- [ ] **Step 1: Write failing transport tests** proving argv construction uses `['service', ..., '--json', JSON.stringify(body)]`, injects fixed config/tmp directories, parses JSON and NDJSON, propagates abort, rejects non-zero exits, and bounds stdout/stderr.
- [ ] **Step 2: Run RED** with `corepack pnpm vitest run plugins/wecom/tests/transport.spec.ts`; expect module-not-found for `src/transport.ts`.
- [ ] **Step 3: Implement minimal transport** with injected `spawnProcess(executable, args, options)` so tests use a deterministic fake while production resolves the package-owned `wecom-cli` bin.
- [ ] **Step 4: Run GREEN** with the same focused command; expect all transport tests to pass.
- [ ] **Step 5: Commit** `plugins/wecom` scaffold and root workspace/script changes as `feat(wecom): add bounded CLI transport`.

### Task 2: Authorization state machine and exact credential deletion

**Files:**
- Create: `plugins/wecom/src/auth.ts`
- Create: `plugins/wecom/src/auth-types.ts`
- Create: `plugins/wecom/tests/auth.spec.ts`
- Create: `plugins/wecom/tests/auth-delete.spec.ts`

**Interfaces:**
- Consumes: `WeComProcessRunner` from Task 1.
- Produces: `WeComAuthController.snapshot(): WeComAuthSnapshot`.
- Produces: `connect()`, `cancel()`, `deleteAuthorization()`, and `subscribe(listener)`.
- Produces: discriminated states `unauthorized | generating_qr | awaiting_scan | authorized | refreshing_schema | ready | sync_failed | deleting`.

- [ ] **Step 1: Write failing state tests** for `auth show --status`, QR generation with fixed `qr.png`, five-minute expiry projection, cancellation, successful recheck, and “authorized but sync failed”.
- [ ] **Step 2: Run RED** and confirm failure is the missing `WeComAuthController`.
- [ ] **Step 3: Implement the state controller** with one active authorization generation, abort propagation, immutable snapshots, and no secret-bearing fields.
- [ ] **Step 4: Write failing deletion tests** that supply resolved owned paths and assert only `credentials.enc`, `.encryption_key`, and `cache` are removed after cancelling calls and unregistering tools; reject paths escaping the config directory.
- [ ] **Step 5: Implement exact deletion** using canonical containment checks and explicit file targets; never recursively remove the configuration root.
- [ ] **Step 6: Run GREEN** for both auth test files and commit as `feat(wecom): manage QR authorization lifecycle`.

### Task 3: Dynamic schema conversion and atomic catalog replacement

**Files:**
- Create: `plugins/wecom/src/discovery.ts`
- Create: `plugins/wecom/src/schema-adapter.ts`
- Create: `plugins/wecom/src/catalog.ts`
- Create: `plugins/wecom/tests/discovery.spec.ts`
- Create: `plugins/wecom/tests/schema-adapter.spec.ts`
- Create: `plugins/wecom/tests/catalog.spec.ts`

**Interfaces:**
- Consumes: `WeComProcessRunner.run({ path: ['schema', 'list'] })`.
- Produces: `discoverMethods(): Promise<readonly DiscoveredMethod[]>`.
- Produces: `adaptMethod(method): AdaptedTool | UnsupportedMethod`.
- Produces: `DynamicToolCatalog.refresh(methods)` and `clear()`; refresh retains the last-good registrations on any candidate failure.

- [ ] **Step 1: Write failing discovery tests** for service/resource/method paths, descriptions, parameter schemas, duplicate normalized names, and malformed discovery output.
- [ ] **Step 2: Run RED** and confirm missing discovery/adapter modules.
- [ ] **Step 3: Implement discovery and lossless supported-schema conversion** for scalar, object, array, enum, required, and additional-properties declarations; return a diagnostic for unsupported constructs.
- [ ] **Step 4: Write failing catalog tests** proving `message.aibot.sessions.list` becomes `wecom_message_aibot_sessions_list`, candidate conflicts abort replacement, and `clear()` disposes every registration.
- [ ] **Step 5: Implement two-phase catalog replacement** by building every definition before disposing the previous effect-scoped registrations.
- [ ] **Step 6: Run GREEN** for the three files and commit as `feat(wecom): register discovered API tools atomically`.

### Task 4: Read/write policy, approvals, and tool execution

**Files:**
- Create: `plugins/wecom/src/policy.ts`
- Create: `plugins/wecom/src/tool-adapter.ts`
- Create: `plugins/wecom/src/errors.ts`
- Create: `plugins/wecom/tests/policy.spec.ts`
- Create: `plugins/wecom/tests/tool-adapter.spec.ts`

**Interfaces:**
- Consumes: `DiscoveredMethod`, `AdaptedTool`, `WeComProcessRunner`, and `ctx.tools.register`.
- Produces: `classifyOperation(method): 'read' | 'write' | 'high-risk'`.
- Produces: DSH tool definitions whose execute body passes only validated JSON to the transport.

- [ ] **Step 1: Write failing policy tests** for known reads, sends/creates/updates, delete/cancel/overwrite/permission changes, and unknown default-high-risk behavior.
- [ ] **Step 2: Run RED** and confirm missing classifier.
- [ ] **Step 3: Implement the classifier** using complete method path plus discovery metadata and explicit deny-biased rules.
- [ ] **Step 4: Write failing tool tests** proving read methods execute directly, mutations emit the correct DSH pre-tool decision/approval summary, result JSON stays canonical, and stderr/token/path fields are redacted.
- [ ] **Step 5: Implement tool definitions and structured error mapping** with pure presentation methods and abort propagation.
- [ ] **Step 6: Run GREEN** and commit as `feat(wecom): enforce dynamic tool approvals`.

### Task 5: Host plugin and fixed Typert Remote authorization API

**Files:**
- Create: `plugins/wecom/src/index.ts`
- Create: `plugins/wecom/src/remote-types.ts`
- Create: `plugins/wecom/src/remote-auth.ts`
- Create: `plugins/wecom/src/typert.host.ts`
- Create: `plugins/wecom/tests/host-plugin.spec.ts`
- Create: `plugins/wecom/tests/host-remote.spec.ts`

**Interfaces:**
- Consumes: Tasks 1-4 and DSH `tools`, `settings`, `typert-protocol` services.
- Produces Remote namespace `wecomAuth` with `status`, `connect`, `cancel`, `refresh`, `deleteAuthorization`, and state-change subscription.
- Produces the Cordis plugin `apply(ctx, config)` and validated timeout/output/concurrency config.

- [ ] **Step 1: Write failing Host lifecycle tests** for unauthorized startup with zero business tools, successful authorization plus refresh, refresh failure retaining authorization, and authorization deletion clearing tools.
- [ ] **Step 2: Run RED** and confirm missing Host plugin.
- [ ] **Step 3: Implement Host composition** and connect auth state transitions to atomic catalog operations.
- [ ] **Step 4: Write failing Remote tests** proving only fixed operations exist, QR is returned as bounded image data, concurrent connect is rejected, and delete requires an explicit confirmation token minted by the Host.
- [ ] **Step 5: Implement Remote service and generated Typert entrypoints** using the repository generator flow.
- [ ] **Step 6: Run GREEN** and commit as `feat(wecom): expose authorization host service`.

### Task 6: Plugin configuration card

**Files:**
- Create: `plugins/wecom/src/client/index.ts`
- Create: `plugins/wecom/src/client/WeComCard.tsx`
- Create: `plugins/wecom/src/client/wecom-card-controller.ts`
- Create: `plugins/wecom/src/client/locales.ts`
- Create: `plugins/wecom/tests/client-controller.spec.ts`
- Create: `plugins/wecom/tests/client-inject.spec.ts`

**Interfaces:**
- Consumes: generated `wecomAuth` Remote client.
- Produces: settings slot id `wecom`, controller actions `connect`, `cancel`, `refresh`, `requestDelete`, `confirmDelete`, and renderable `WeComCardState`.

- [ ] **Step 1: Write failing controller tests** for unauthorized button, QR/countdown state, cancel/regenerate, ready status, sync-failed retry, two-step delete confirmation, and Remote event refresh.
- [ ] **Step 2: Run RED** and confirm missing controller.
- [ ] **Step 3: Implement the controller** as a snapshot store driven only by Remote state and user actions.
- [ ] **Step 4: Write failing injection/render tests** for the Plugins settings slot, localized labels, QR image, hidden secret/path fields, and correct button availability per state.
- [ ] **Step 5: Implement Client plugin and card** by reusing DSH settings plugin primitives and the mail card mounting pattern.
- [ ] **Step 6: Run GREEN** and commit as `feat(wecom): add plugin authorization card`.

### Task 7: Production bundle, Desktop installation, and documentation

**Files:**
- Create: `plugins/wecom/cordis.patch.yml`
- Create: `plugins/wecom/README.md`
- Modify: `plugins/wecom/package.json`
- Modify: `apps/desktop/tests/plugin-install.e2e.ts`
- Modify: `Makefile`
- Modify: `README.md`
- Modify: `README.zh.md`

**Interfaces:**
- Produces: installable `plugins/wecom/dsh-wecom-0.1.0.tgz`.
- Produces: `make pack-plugin PLUGIN=wecom` and `make install-plugin PLUGIN=wecom`.

- [ ] **Step 1: Write failing package/install tests** asserting the tgz contains Host, Client, Remote, patch, `@wecom/cli`, and executable resolution without global PATH support.
- [ ] **Step 2: Run RED** with focused packaging and Desktop plugin-install tests; expect missing bundle/archive support.
- [ ] **Step 3: Implement package exports, build pipeline, Cordis patch, Makefile selection, and Desktop test parameterization** without changing mail behavior.
- [ ] **Step 4: Add concise installation and authorization documentation** in English and Chinese root docs plus plugin README.
- [ ] **Step 5: Run GREEN** for plugin tests, root packaging tests, Desktop tests, build, and a release-shaped runtime stage.
- [ ] **Step 6: Commit** as `feat(wecom): ship standard desktop plugin`.

### Task 8: Final verification and review

**Files:**
- Modify only files required by failures found during verification, always after adding a focused failing regression test.

**Interfaces:**
- Consumes the complete plugin and produces verified release evidence.

- [ ] **Step 1: Run** `corepack pnpm vitest run plugins/wecom/tests` and record the passing count.
- [ ] **Step 2: Run** root packaging tests, `corepack pnpm run verify:upstream`, `corepack pnpm run desktop:test`, and the wecom pack/install smoke.
- [ ] **Step 3: Run** `git diff --check`, package validation, and inspect the tgz file list for missing or secret-bearing artifacts.
- [ ] **Step 4: Request code review** using the requesting-code-review skill and resolve findings test-first.
- [ ] **Step 5: Use verification-before-completion** before claiming the plugin complete.
