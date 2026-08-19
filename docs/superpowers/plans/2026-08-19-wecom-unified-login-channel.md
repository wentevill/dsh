# WeCom Unified Login and Bot Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one QR login provision both `wecom-cli` and the WeCom AI Bot WebSocket, bridge inbound/outbound Bot messages to stable Harness sessions, hide unavailable API families, and fully remove every login-owned resource.

**Architecture:** A QGuard-derived QR manager owns credential acquisition and persists Bot ID/Secret through `ctx.credentials`. A PTY adapter feeds those credentials to the official CLI without placing the Secret in argv, while the official `@wecom/aibot-node-sdk` owns WebSocket authentication and reconnect. A runtime-neutral bridge maps WeCom rooms to deterministic Harness session ids and projects assistant events back through the originating WeCom callback.

**Tech Stack:** TypeScript 6, Cordis 4, DeepSeek Harness Agent/Session/Credentials/Attachment services, `@wecom/cli` 1.1.0, `@wecom/aibot-node-sdk` 1.0.7, `node-pty` 1.1.0, React 19, Vitest 4.

## Global Constraints

- Never return, render, log, or place Bot Secret in process argv.
- Every QR start replaces and cancels the preceding login attempt.
- Removal order is WebSocket stop → agent bridge disposal → dynamic tools clear → CLI files delete → credential refs unset → UI state unauthorized.
- Capability probes are read-only; no probe sends a message or performs another mutation.
- Only known permanent WeCom denial codes suppress tools; transient failures remain visible and retain catalog entries.
- WebSocket `connected` means `aibot_subscribe` acknowledgement succeeded.
- Inbound messages are deduplicated by Bot ID plus `msgid`.
- Use the official SDK for WebSocket frames, heartbeats, reconnect, downloads, and replies.

---

### Task 1: Preserve Native WeCom Failure Details

**Files:**
- Modify: `plugins/wecom/src/transport.ts`
- Modify: `plugins/wecom/tests/transport.spec.ts`

**Interfaces:**
- Produces: `WeComCliError(message, exitCode, code)` populated from nested `{ error }` or top-level `{ errcode, errmsg, help_message }`.

- [ ] **Step 1: Add failing top-level error tests**

Add cases whose executor returns exit code 1 with:

```ts
{ errcode: 850002, errmsg: 'no authorization', help_message: '授权说明\nhttps://example.test/grant' }
{ errcode: 853006, errmsg: 'this tool is not available for your corporation' }
```

Assert `code` is retained and `help_message` has verbatim precedence over `errmsg`.

- [ ] **Step 2: Run RED**

Run: `./node_modules/.bin/vitest run tests/transport.spec.ts`

Expected: FAIL because `structuredFailure()` returns the generic exit-code message.

- [ ] **Step 3: Implement the two-envelope parser**

Parse one object and select fields without transforming `help_message`:

```ts
const topCode = typeof parsed.errcode === 'number' ? parsed.errcode : undefined
const topMessage = typeof parsed.help_message === 'string'
  ? parsed.help_message
  : typeof parsed.errmsg === 'string' ? parsed.errmsg : undefined
```

Fall back to the existing nested envelope and finally the generic message.

- [ ] **Step 4: Run GREEN and commit**

Run: `./node_modules/.bin/vitest run tests/transport.spec.ts`

Commit: `fix(wecom): preserve native API failures`

---

### Task 2: Acquire and Persist Bot Credentials from One QR Login

**Files:**
- Create: `plugins/wecom/src/qr-auth-manager.ts`
- Create: `plugins/wecom/src/bot-credentials.ts`
- Create: `plugins/wecom/tests/qr-auth-manager.spec.ts`
- Create: `plugins/wecom/tests/bot-credentials.spec.ts`
- Modify: `plugins/wecom/src/remote-types.ts`
- Modify: `plugins/wecom/src/auth.ts`
- Modify: `plugins/wecom/tsconfig.build.json`

**Interfaces:**
- Produces:

```ts
interface BotCredentials { botId: string; secret: string }
interface QrAuthSession { qrUrl: string; credentials: Promise<BotCredentials>; cancel(): void }
interface BotCredentialStore {
  load(): Promise<BotCredentials | undefined>
  save(value: BotCredentials): Promise<void>
  remove(): Promise<void>
}
function createQrAuthManager(options: {
  generateUrl: string; queryUrl: string; source: string
  fetch: typeof globalThis.fetch; pollIntervalMs: number; timeoutMs: number
}): { start(signal?: AbortSignal): Promise<QrAuthSession> }
```

- [ ] **Step 1: Add RED QR lifecycle tests**

Use a fake `fetch` sequence to verify `source`/`plat=0`, pending → success,
`bot_info.botid/secret`, incomplete credentials, explicit expiry, timeout,
caller cancellation, and a second `start()` cancelling the first session.

- [ ] **Step 2: Run RED**

Run: `./node_modules/.bin/vitest run tests/qr-auth-manager.spec.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement the manager**

Port only QGuard's verified state machine. Keep credentials inside the resolved
promise and expose only `qrUrl` before completion. Use condition-based polling
and one internal `AbortController`; abort it on every terminal path.

- [ ] **Step 4: Add RED credential-store tests**

Fake the Harness provider and assert refs `WECOM_BOT_ID` and
`WECOM_BOT_SECRET` are set, partial save rolls back both, `load()` requires both,
and `remove()` attempts both unsets even if one rejects.

- [ ] **Step 5: Implement credential storage**

Use `credentialRef()` and inject `ctx.credentials`; never include values in an
error. Extend auth snapshots with safe `botId`, `apiState`, and `channelState`
only.

- [ ] **Step 6: Run GREEN and commit**

Run: `./node_modules/.bin/vitest run tests/qr-auth-manager.spec.ts tests/bot-credentials.spec.ts`

Commit: `feat(wecom): acquire bot credentials from QR login`

---

### Task 3: Provision and Remove the Official CLI Profile

**Files:**
- Create: `plugins/wecom/src/cli-provisioner.ts`
- Create: `plugins/wecom/tests/cli-provisioner.spec.ts`
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/wecom/pnpm-lock.yaml`
- Modify: `plugins/wecom/src/auth-files.ts`
- Modify: `plugins/wecom/tsconfig.build.json`

**Interfaces:**
- Produces:

```ts
interface PtyProcess {
  onData(listener: (data: string) => void): { dispose(): void }
  onExit(listener: (event: { exitCode: number }) => void): { dispose(): void }
  write(data: string): void
  kill(): void
}
interface CliProvisioner {
  provision(credentials: BotCredentials, signal?: AbortSignal): Promise<void>
  remove(): Promise<void>
}
```

- [ ] **Step 1: Add `node-pty@1.1.0` and write RED protocol tests**

With a fake PTY, assert `auth init --manual` is invoked with no credential argv,
Bot ID is written only after the `Bot ID` prompt, Secret only after the
`Secret` prompt, prompt/output buffers are bounded and redacted, abort kills the
PTY, nonzero exit rejects, and successful exit requires `auth show --status`
to return authorized.

- [ ] **Step 2: Run RED**

Run: `./node_modules/.bin/vitest run tests/cli-provisioner.spec.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement PTY provisioning and complete removal**

Spawn the native CLI directly with `cwd=tempDir` and profile-confined env.
Never interpolate credentials into diagnostics. `remove()` deletes only the
allowlisted plugin-owned CLI auth/config/cache files and the plugin temp tree.

- [ ] **Step 4: Run GREEN and commit**

Run: `./node_modules/.bin/vitest run tests/cli-provisioner.spec.ts tests/auth-files.spec.ts`

Commit: `feat(wecom): provision CLI from unified login`

---

### Task 4: Filter Unavailable Dynamic API Tools

**Files:**
- Create: `plugins/wecom/src/capabilities.ts`
- Create: `plugins/wecom/tests/capabilities.spec.ts`
- Modify: `plugins/wecom/src/host.ts`
- Modify: `plugins/wecom/tests/host.spec.ts`
- Modify: `plugins/wecom/tsconfig.build.json`

**Interfaces:**
- Produces:

```ts
function filterAvailableMethods(
  methods: readonly DiscoveredMethod[],
  runner: Runner,
  now: () => Date,
): Promise<{ methods: readonly DiscoveredMethod[]; warnings: readonly string[] }>
```

- [ ] **Step 1: Write RED capability tests**

Assert the sentinel contact query, bounded recent chat query, bot-session query,
suppression for `850002`/`853006`, retention on transient/unknown failure,
exclusion of generic `message.send`, and retention of `message.aibot.send` only
when the bot-session probe succeeds.

- [ ] **Step 2: Run RED**

Run: `./node_modules/.bin/vitest run tests/capabilities.spec.ts`

- [ ] **Step 3: Implement filtering and integrate atomic refresh**

Call filtering after discovery and before `catalog.refresh()`. Carry warnings
into the safe auth snapshot; never serialize probe results containing contacts
or conversation metadata.

- [ ] **Step 4: Run GREEN and commit**

Run: `./node_modules/.bin/vitest run tests/capabilities.spec.ts tests/host.spec.ts`

Commit: `feat(wecom): register only available bot APIs`

---

### Task 5: Bridge WeCom WebSocket Messages to Harness Sessions

**Files:**
- Create: `plugins/wecom/src/bot-channel.ts`
- Create: `plugins/wecom/src/message-normalizer.ts`
- Create: `plugins/wecom/src/session-binding.ts`
- Create: `plugins/wecom/src/harness-bridge.ts`
- Create: `plugins/wecom/tests/bot-channel.spec.ts`
- Create: `plugins/wecom/tests/message-normalizer.spec.ts`
- Create: `plugins/wecom/tests/session-binding.spec.ts`
- Create: `plugins/wecom/tests/harness-bridge.spec.ts`
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/wecom/pnpm-lock.yaml`
- Modify: `plugins/wecom/tsconfig.build.json`

**Interfaces:**
- Consumes: `BotCredentials`, `ctx.agents`, `ctx.sessions`, optional
  `ctx.sessionPersistence`, optional `ctx.attachments`.
- Produces:

```ts
type ChannelState = 'disabled' | 'connecting' | 'connected' | 'reconnecting' | 'auth_failed' | 'disconnected'
interface BotChannel {
  start(credentials: BotCredentials): Promise<void>
  stop(): Promise<void>
  state(): ChannelState
}
function sessionIdFor(botId: string, chatType: 'single' | 'group', roomId: string): SessionId
```

- [ ] **Step 1: Add the official SDK dependency and RED channel tests**

Add `@wecom/aibot-node-sdk@1.0.7`. Fake only its client boundary and assert
connected/authenticated/reconnecting/disconnected transitions, event listener
disposal, and no credential logging.

- [ ] **Step 2: Add RED normalization and binding tests**

Cover text, voice transcription, mixed text/images, unsupported types, download
timeout/size rejection, DM key by userid, group key by chatid, stable hashed
SessionId, and deduplication by `botId:msgid`.

- [ ] **Step 3: Add RED Harness bridge tests**

Use narrow fake Agent/Session ports to assert create-or-resume, exactly one
`createUserMessage`, per-room serialization, assistant text extraction from
new `assistant/message` events, streaming reply calls, final completion,
turn-error response, callback expiry, and bridge disposal of owned handles.

- [ ] **Step 4: Implement channel, normalizer, binding, and bridge**

The Cordis integration uses `ctx.agents.create()` for absent sessions,
`ctx.agents.resume()` for persisted ids, `agent.followup()` and
`agent.whenIdle()`. Capture the pre-turn event sequence and return only assistant
text appended by that turn. Persist images through `ctx.attachments.saveImages`
before constructing image content blocks; reject other binary types explicitly
until Harness exposes a durable generic-file attachment seam.

- [ ] **Step 5: Run GREEN and commit**

Run: `./node_modules/.bin/vitest run tests/bot-channel.spec.ts tests/message-normalizer.spec.ts tests/session-binding.spec.ts tests/harness-bridge.spec.ts`

Commit: `feat(wecom): bridge bot messages to Harness sessions`

---

### Task 6: Compose Login, Runtime State, and Correct Removal

**Files:**
- Modify: `plugins/wecom/src/index.ts`
- Modify: `plugins/wecom/src/auth.ts`
- Modify: `plugins/wecom/src/auth-remote.ts`
- Modify: `plugins/wecom/src/remote-types.ts`
- Modify: `plugins/wecom/src/host.ts`
- Create: `plugins/wecom/tests/login-lifecycle.spec.ts`
- Modify: `plugins/wecom/tests/auth.spec.ts`
- Modify: `plugins/wecom/tests/auth-remote.spec.ts`

**Interfaces:**
- The `connect` operation starts QR authorization; completion transactionally
  stores credentials, provisions CLI, refreshes tools, and starts the channel.
- `deleteAuthorization(true)` invokes one idempotent lifecycle disposer in the
  exact global-constraint order and returns `unauthorized` only after cleanup.

- [ ] **Step 1: Write RED end-to-end lifecycle tests with fakes**

Assert successful one-scan login, CLI failure rollback, WebSocket failure as a
distinct channel state, restart from stored credentials, concurrent connect
coalescing, cancel, deletion during connect, deletion while connected, every
cleanup step attempted after an earlier failure, idempotent repeated delete,
and no tools/credentials/channel/owned agents after successful removal.

- [ ] **Step 2: Run RED**

Run: `./node_modules/.bin/vitest run tests/login-lifecycle.spec.ts`

- [ ] **Step 3: Implement the lifecycle coordinator and Cordis injection**

Inject `tools`, `credentials`, `agents`, and `sessions`; treat attachments and
session persistence as optional enhancements. Register every long-lived
resource beneath one Cordis effect and await async disposal.

- [ ] **Step 4: Run GREEN and commit**

Run: `./node_modules/.bin/vitest run tests/login-lifecycle.spec.ts tests/auth.spec.ts tests/auth-remote.spec.ts`

Commit: `feat(wecom): unify login and removal lifecycle`

---

### Task 7: Show Bilingual API and Bot Connection State

**Files:**
- Modify: `plugins/wecom/src/client/index.tsx`
- Modify: `plugins/wecom/src/client/locales.ts`
- Modify: `plugins/wecom/src/client/card-css.ts`
- Modify: `plugins/wecom/src/remote-types.ts`
- Modify: `plugins/wecom/tests/client-locales.spec.ts`
- Create: `plugins/wecom/tests/client-channel-state.spec.ts`

**Interfaces:**
- Consumes safe auth snapshot fields only; Secret never crosses the Remote API.

- [ ] **Step 1: Write RED locale/state tests**

Require complete English/Chinese labels for API sync and Bot connection states,
safe Bot ID display, channel failure, reconnecting, and removal progress.

- [ ] **Step 2: Run RED, implement, and run GREEN**

Run before and after: `./node_modules/.bin/vitest run tests/client-locales.spec.ts tests/client-channel-state.spec.ts`

Render separate API/channel rows, keep the authorization button action-backed,
disable conflicting actions while busy, and require confirmation before delete.

- [ ] **Step 3: Commit**

Commit: `feat(wecom): show unified login and channel state`

---

### Task 8: Release, Install, and Real Message Verification

**Files:**
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/wecom/README.md`
- Modify: `plugins/wecom/lib/**` through `npm run build`
- Test: `packaging/makefile.spec.ts`

**Interfaces:**
- Produces: `plugins/wecom/dsh-wecom-0.2.0.tgz` and a Makefile-installed web-profile plugin.

- [ ] **Step 1: Bump to 0.2.0 and document login/removal behavior**

Document that one QR provisions API plus channel, what each status means, and
that removal deletes credentials, CLI auth, tools, bindings, and WebSocket.

- [ ] **Step 2: Run complete verification**

```bash
npm run build
./node_modules/.bin/vitest run
cd ../.. && ./node_modules/.bin/vitest run packaging
make pack-plugin PLUGIN=wecom
```

Expected: all commands exit 0 and produce `dsh-wecom-0.2.0.tgz`.

- [ ] **Step 3: Review, install, and verify real lifecycle**

Request code review and resolve all Critical/Important findings. Then run:

```bash
make install-plugin PLUGIN=wecom PROFILE=web
```

With explicit user participation, generate a fresh QR, scan it, verify subscribe
ack, send a WeCom test message, observe exactly one Harness turn and reply, then
remove login and verify credential refs absent, CLI auth unauthorized, no
WebSocket process/listeners, no dynamic WeCom tools, and UI unauthorized.

- [ ] **Step 4: Commit**

Commit: `feat(wecom): release unified bot channel`
