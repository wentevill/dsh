# WeCom WebSocket Room Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owned WeCom AI Bot WebSocket channel that reconnects safely, maps each Bot-scoped room to one durable Harness session through `ctx.storageDomain`, serializes turns per room, and passively replies through the originating callback frame.

**Architecture:** Keep the official `@wecom/aibot-node-sdk@1.0.7` behind a runtime-neutral adapter. A generation-owned connection controller feeds normalized inbound envelopes into a bounded per-room scheduler; the scheduler resolves a durable room/session binding and invokes a Harness agent bridge. Authorization becomes the single QR flow that stores Bot credentials, provisions CLI access, and starts or stops the channel without deleting room mappings.

**Tech Stack:** TypeScript 6, Cordis 4, `@wecom/aibot-node-sdk@1.0.7`, Harness Agent/Session/Credentials/Storage Domain services, Zod 4, Vitest 4.

## Global Constraints

- All code, dependencies, settings, and durable state belong to `plugins/wecom`.
- Do not modify `deepseek-harness-source`.
- Bot Secret never enters logs, settings, Remote output, storage-domain rows, session messages, or argv.
- Only room/session metadata is stored in `ctx.storageDomain`; Harness session persistence owns conversation content.
- One room is serial; different rooms run concurrently under a fixed bound.
- Group callbacks rely on WeCom's bot-targeted delivery contract because SDK 1.0.7 exposes no mention flag.
- Passive replies use the exact callback `headers.req_id` through `replyStream`; `msgid` is only for deduplication.
- Every socket, timer, listener, queue, and promise is owned by one abortable generation.
- Authorization deletion retains room mappings.

---

### Task 1: Package and Runtime Contracts

**Files:**
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/wecom/pnpm-lock.yaml`
- Modify: `plugins/wecom/cordis.patch.yml`
- Modify: `plugins/wecom/tsconfig.build.json`
- Create: `plugins/wecom/src/channel-types.ts`
- Create: `plugins/wecom/tests/package-channel.spec.ts`

**Interfaces:**
- Consumes: official `WSClient`, `WsFrame<BaseMessage>`, Harness `Context` service declarations.
- Produces: `ChannelState`, `InboundEnvelope`, `WeComChannelSnapshot`, `SdkClient`, and `SdkClientFactory` without leaking SDK types past `sdk-adapter.ts`.

- [ ] **Step 1: Write the failing package contract test**

Assert `@wecom/aibot-node-sdk` is exactly `1.0.7`; Agent, Session, Credentials, Storage, Storage Domain, Agent Default Model, and Agent Presets are peer dependencies; the Cordis patch injects the matching capabilities into `dsh-wecom`; and the package exports no Bot Secret field.

- [ ] **Step 2: Run the package test and verify RED**

Run: `./node_modules/.bin/vitest run tests/package-channel.spec.ts`

Expected: FAIL because the SDK and Host capability peers/injections are absent.

- [ ] **Step 3: Define runtime-neutral contracts and package dependencies**

Use the following stable adapter boundary:

```ts
export type ChannelState =
  | 'stopped' | 'connecting' | 'subscribing' | 'connected'
  | 'reconnect_wait' | 'auth_failed' | 'failed'

export interface InboundEnvelope {
  readonly requestId: string
  readonly messageId: string
  readonly botId: string
  readonly room: { readonly kind: 'direct' | 'group'; readonly id: string }
  readonly senderId: string
  readonly content: readonly NormalizedInboundBlock[]
  readonly replyContext: unknown
}

export interface SdkClient {
  connect(): void
  disconnect(): void
  on<K extends keyof SdkEventMap>(event: K, listener: (...args: SdkEventMap[K]) => void): () => void
  reply(context: unknown, streamId: string, content: string, finish: boolean): Promise<void>
  download(url: string, aesKey?: string): Promise<{ buffer: Uint8Array; filename?: string }>
}
```

Add each new source file to `tsconfig.build.json` as it is introduced.

- [ ] **Step 4: Install dependencies and run GREEN**

Run: `corepack pnpm install --lockfile-only` from `plugins/wecom`, then `./node_modules/.bin/vitest run tests/package-channel.spec.ts`.

- [ ] **Step 5: Commit**

```sh
git add plugins/wecom/package.json plugins/wecom/pnpm-lock.yaml plugins/wecom/cordis.patch.yml plugins/wecom/tsconfig.build.json plugins/wecom/src/channel-types.ts plugins/wecom/tests/package-channel.spec.ts
git commit -m "feat(wecom): define websocket channel contracts"
```

---

### Task 2: Official SDK Adapter and Connection Generation

**Files:**
- Create: `plugins/wecom/src/sdk-adapter.ts`
- Create: `plugins/wecom/src/channel-state-machine.ts`
- Create: `plugins/wecom/tests/sdk-adapter.spec.ts`
- Create: `plugins/wecom/tests/channel-state-machine.spec.ts`

**Interfaces:**
- Consumes: `SdkClientFactory`, Bot credentials resolved per start, generation `AbortSignal`.
- Produces: `createSdkClientFactory()` and `createChannelController(options)` with `start`, `stop`, `snapshot`, and `subscribe`.

- [ ] **Step 1: Write RED state-machine tests**

With fake clocks and a fake SDK client, cover:

```ts
expect(states).toEqual(['connecting', 'subscribing', 'connected'])
expect(backoffDelays).toEqual([1000, 2000, 4000, 8000, 15000, 30000])
```

Also assert one connect attempt, stale-generation event rejection, stable-connect reset, auth failure with no retry, network-restored immediate retry, repeated start stopping the old client, and stop leaving zero listeners/timers/clients.

- [ ] **Step 2: Run state tests and verify RED**

Run: `./node_modules/.bin/vitest run tests/channel-state-machine.spec.ts tests/sdk-adapter.spec.ts`

Expected: FAIL because adapter and controller modules do not exist.

- [ ] **Step 3: Implement the SDK adapter**

Construct `WSClient` as a single-attempt transport with `maxReconnectAttempts: 0` and `maxAuthFailureAttempts: 0`, bounded reply queue, request timeout, and a redacting logger. The plugin controller is the sole reconnect owner; this prevents SDK and plugin timers from racing or surviving different generations. Translate SDK errors into `auth`, `network`, `timeout`, and `permanent` categories. Register listeners through disposer-returning wrappers. `reply()` must call:

```ts
await client.replyStream(frame, streamId, content, true)
```

and must never synthesize an unreferenced proactive send.

- [ ] **Step 4: Implement the outer generation state machine**

Track exactly one active generation containing the client, abort controller, listener disposers, retry timer, stable timer, and active operations. Use injectable clock/random seams; jitter stays within ±20 percent of the nominal delay and never exceeds 30 seconds. `authenticated` is the only transition to `connected`.

- [ ] **Step 5: Run GREEN and full regression tests**

Run: `./node_modules/.bin/vitest run tests/channel-state-machine.spec.ts tests/sdk-adapter.spec.ts && ./node_modules/.bin/vitest run`

- [ ] **Step 6: Commit**

```sh
git add plugins/wecom/src/sdk-adapter.ts plugins/wecom/src/channel-state-machine.ts plugins/wecom/tests/sdk-adapter.spec.ts plugins/wecom/tests/channel-state-machine.spec.ts plugins/wecom/tsconfig.build.json
git commit -m "feat(wecom): own websocket reconnect lifecycle"
```

---

### Task 3: Normalize and Bound Inbound Messages

**Files:**
- Create: `plugins/wecom/src/message-normalizer.ts`
- Create: `plugins/wecom/src/recent-message-cache.ts`
- Create: `plugins/wecom/tests/message-normalizer.spec.ts`
- Create: `plugins/wecom/tests/recent-message-cache.spec.ts`

**Interfaces:**
- Consumes: SDK adapter frame projection, `download()`, Harness LLM content-block types, and the attachment service used to materialize downloaded bytes into session-safe references.
- Produces: `normalizeInbound(input, limits, signal): Promise<InboundEnvelope>` and `RecentMessageCache.accept(botId, msgid): boolean`.

- [ ] **Step 1: Write RED normalization tests**

Cover direct and group room derivation, text, voice transcription, mixed text/image order, image/file download, missing `chatid`, malformed sender, unsupported video, byte limit, timeout, aborted download, and request-context preservation. Assert diagnostics contain no content, URLs, AES keys, room IDs, or sender IDs.

- [ ] **Step 2: Write RED deduplication tests**

Use a fixed clock to assert duplicate rejection, Bot isolation, oldest-entry eviction, TTL expiry, and a strict maximum entry count.

- [ ] **Step 3: Run tests and verify RED**

Run: `./node_modules/.bin/vitest run tests/message-normalizer.spec.ts tests/recent-message-cache.spec.ts`

- [ ] **Step 4: Implement bounded normalization and cache**

Default limits: 10 MiB per attachment, 20 MiB total, 15-second download deadline, 1024 recent IDs, and 10-minute in-memory TTL. Never persist message IDs or attachment bytes in the room mapping domain.

- [ ] **Step 5: Run GREEN and commit**

```sh
./node_modules/.bin/vitest run tests/message-normalizer.spec.ts tests/recent-message-cache.spec.ts
git add plugins/wecom/src/message-normalizer.ts plugins/wecom/src/recent-message-cache.ts plugins/wecom/tests/message-normalizer.spec.ts plugins/wecom/tests/recent-message-cache.spec.ts plugins/wecom/tsconfig.build.json
git commit -m "feat(wecom): normalize bounded inbound messages"
```

---

### Task 4: Durable Room-to-Session Mapping

**Files:**
- Create: `plugins/wecom/src/room-session-domain.ts`
- Create: `plugins/wecom/src/room-session-store.ts`
- Create: `plugins/wecom/tests/room-session-domain.spec.ts`
- Create: `plugins/wecom/tests/room-session-store.spec.ts`

**Interfaces:**
- Consumes: `DomainFacility.open`, `KvTable`, room identity, `sessionExists(SessionId)` and `createSessionId()` callbacks.
- Produces: `wecomRoomSessionsSpec` and `RoomSessionStore.resolve(room): Promise<SessionId>`.

- [ ] **Step 1: Write RED domain and store tests**

Define a memory-domain harness and assert schema rejection, HMAC-stable keys, Bot/group/direct isolation, no raw identifiers in table keys or values, existing mapping reuse, concurrent first-message single creation, stale session replacement, durable write before resolve, failed write rejection, close idempotence, and mapping survival across store reopen.

- [ ] **Step 2: Run tests and verify RED**

Run: `./node_modules/.bin/vitest run tests/room-session-domain.spec.ts tests/room-session-store.spec.ts`

- [ ] **Step 3: Implement the typed domain**

Declare:

```ts
const roomRecord = z.object({
  botDigest: z.string(),
  kind: z.enum(['direct', 'group']),
  sessionId: z.string(),
  createdAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative(),
})

export const wecomRoomSessionsSpec = defineDomain({
  name: 'wecom_room_sessions', version: 1,
  tables: { rooms: domainTable<RoomDigest, RoomRecord>(roomRecord) },
})
```

Use HMAC-SHA-256 with a credential-service-held plugin salt. Serialize lookup-or-create per room digest. Persist the mapping before returning a newly created session ID.

- [ ] **Step 4: Run GREEN and commit**

```sh
./node_modules/.bin/vitest run tests/room-session-domain.spec.ts tests/room-session-store.spec.ts
git add plugins/wecom/src/room-session-domain.ts plugins/wecom/src/room-session-store.ts plugins/wecom/tests/room-session-domain.spec.ts plugins/wecom/tests/room-session-store.spec.ts plugins/wecom/tsconfig.build.json
git commit -m "feat(wecom): persist room session bindings"
```

---

### Task 5: Per-Room Scheduler and Harness Agent Bridge

**Files:**
- Create: `plugins/wecom/src/room-scheduler.ts`
- Create: `plugins/wecom/src/harness-bridge.ts`
- Create: `plugins/wecom/tests/room-scheduler.spec.ts`
- Create: `plugins/wecom/tests/harness-bridge.spec.ts`

**Interfaces:**
- Consumes: normalized envelope, `RoomSessionStore`, `ctx.agents`, `ctx.sessions`, `ctx.sessionPersistence`, default model, optional preset roster, and SDK reply function.
- Produces: `RoomScheduler.enqueue(roomKey, task)` and `HarnessBridge.handle(envelope, signal)`.

- [ ] **Step 1: Write RED scheduler tests**

Assert FIFO execution within one room, parallel execution across rooms, global concurrency cap, per-room capacity rejection, abort of queued work, no detached promise, and drain timeout behavior.

- [ ] **Step 2: Write RED bridge tests**

Test new-session creation, cold resume, live agent reuse, deleted-session replacement, default model selection, recorded preset restoration, user-message construction, `agent.followup`, `agent.whenIdle`, `ctx.sessions.flush`, final assistant text extraction from the new event interval, failed turn handling, empty response, reply ack, abort before reply, and handle disposal.

- [ ] **Step 3: Run tests and verify RED**

Run: `./node_modules/.bin/vitest run tests/room-scheduler.spec.ts tests/harness-bridge.spec.ts`

- [ ] **Step 4: Implement scheduler and canonical driver**

Create/resume agents through `ctx.agents`; install model selection and the session's recorded agent preset before publication. Snapshot `firstSeq`, submit:

```ts
agent.followup(createUserMessage({
  content: normalizedBlocks,
  source: { kind: 'user' },
}))
await agent.whenIdle()
await ctx.sessions.flush(agent.session)
```

Extract only text blocks from `assistant/message` events at or after `firstSeq`, require a completed turn, and pass the exact callback context to the SDK adapter reply.

- [ ] **Step 5: Run GREEN and commit**

```sh
./node_modules/.bin/vitest run tests/room-scheduler.spec.ts tests/harness-bridge.spec.ts
git add plugins/wecom/src/room-scheduler.ts plugins/wecom/src/harness-bridge.ts plugins/wecom/tests/room-scheduler.spec.ts plugins/wecom/tests/harness-bridge.spec.ts plugins/wecom/tsconfig.build.json
git commit -m "feat(wecom): bridge rooms into harness sessions"
```

---

### Task 6: Unified QR Credentials and Channel Integration

**Files:**
- Create: `plugins/wecom/src/qr-auth-manager.ts`
- Create: `plugins/wecom/src/channel-host.ts`
- Modify: `plugins/wecom/src/auth.ts`
- Modify: `plugins/wecom/src/cli-auth-backend.ts`
- Modify: `plugins/wecom/src/index.ts`
- Modify: `plugins/wecom/src/remote-types.ts`
- Modify: `plugins/wecom/src/client/index.tsx`
- Modify: `plugins/wecom/src/client/locales.ts`
- Create: `plugins/wecom/tests/qr-auth-manager.spec.ts`
- Create: `plugins/wecom/tests/channel-host.spec.ts`
- Modify: `plugins/wecom/tests/auth-delete.spec.ts`
- Modify: `plugins/wecom/tests/client-locales.spec.ts`

**Interfaces:**
- Consumes: WeCom `/ai/qc/generate` and `/ai/qc/query_result`, Credentials provider, CLI provisioner, storage domain, channel controller, bridge.
- Produces: one authorization controller and a combined safe snapshot with independent `api` and `channel` substates.

- [ ] **Step 1: Write RED QR tests**

With a fake HTTP client, cover generate, pending, success, incomplete bot info, upstream error, expiry, cancellation, repeated connect replacing the prior QR, credential write rollback, and zero Secret exposure. Assert fixed endpoints, `source=dsh-wecom`, `plat=0`, response-size bounds, and request deadlines.

- [ ] **Step 2: Write RED integration/lifecycle tests**

Cover authorized startup, channel start only after credentials and domain open, API/channel independent state, credential-change restart, delete stopping channel before removing credentials, mapping retention, reconnect status, plugin dispose draining every resource, and stale callbacks after reauthorization.

- [ ] **Step 3: Run tests and verify RED**

Run: `./node_modules/.bin/vitest run tests/qr-auth-manager.spec.ts tests/channel-host.spec.ts tests/auth-delete.spec.ts`

- [ ] **Step 4: Implement unified authorization**

Store Bot ID and Secret under fixed credential refs (`WECOM_BOT_ID`, `WECOM_BOT_SECRET`) and the room-key salt under `WECOM_ROOM_KEY_SALT`. Resolve per channel start; never cache beyond the generation. Provision CLI through a stdin-capable adapter only after credential persistence; no Secret appears in argv or diagnostics.

- [ ] **Step 5: Compose the channel in `apply()`**

Change injection to include `credentials`, `storageDomain`, `agents`, `sessions`, `sessionPersistence`, `attachments`, and `agentDefaultModel`, with `agentPresets` optional. Add the corresponding Harness definition packages as peers/dev dependencies and patch capabilities by their actual package names. Open the room domain once for plugin lifetime, create the scheduler/bridge/controller, and register an awaited Cordis disposer that stops the channel, drains the scheduler, disposes owned agent handles, and closes the domain.

- [ ] **Step 6: Update the bilingual settings card**

Show API state and channel state independently, including next retry and safe error. Keep authorization actions unchanged and never add Bot Secret inputs or values.

- [ ] **Step 7: Run GREEN and commit**

```sh
./node_modules/.bin/vitest run tests/qr-auth-manager.spec.ts tests/channel-host.spec.ts tests/auth-delete.spec.ts tests/client-locales.spec.ts
git add plugins/wecom/src plugins/wecom/tests plugins/wecom/tsconfig.build.json
git commit -m "feat(wecom): integrate unified bot channel"
```

---

### Task 7: Release, Installation, and Live Verification

**Files:**
- Modify: `plugins/wecom/package.json`
- Modify: `plugins/wecom/README.md`
- Modify: generated `plugins/wecom/lib/**`
- Produce: `plugins/wecom/dsh-wecom-0.2.0.tgz`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: installable `dsh-wecom@0.2.0` and verified Desktop `web` profile.

- [ ] **Step 1: Add release assertions**

Extend package tests to require channel, domain, bridge, SDK adapter, generated Host types, SDK dependency, and all Harness peers in the tarball.

- [ ] **Step 2: Run the full fresh verification suite**

```sh
./node_modules/.bin/vitest run
npm run build
git diff --check
npm pack --ignore-scripts --cache /tmp/dsh-wecom-npm-cache --pack-destination /tmp
```

Expected: every test passes, build exits 0, and the tarball contains no fixture credentials or runtime mapping values.

- [ ] **Step 3: Package and install through Makefile**

From repository root:

```sh
make pack-plugin PLUGIN=wecom
make install-plugin PLUGIN=wecom PROFILE=web
```

- [ ] **Step 4: Verify the installed runtime**

Start the Desktop-bundled DSH CLI with `--profile web --port 0`. Confirm plugin load, authorized API status, channel state progression to `connected`, one safe test callback mapping to one Harness session, referenced reply acknowledgement, TCP interruption and resubscription, and clean `Ctrl+C` with no surviving Node process or socket.

- [ ] **Step 5: Commit the release**

```sh
git add plugins/wecom
git commit -m "feat(wecom): release websocket room sessions"
```
