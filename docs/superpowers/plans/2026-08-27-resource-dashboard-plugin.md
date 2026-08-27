# Resource Dashboard Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable `dsh-resource-dashboard` plugin that shows numeric values and appropriate rolling 24-hour charts for DSH activity, host resources, and chat outcomes.

**Architecture:** A host plugin consumes `session/event`, samples the host every five seconds, and persists 1,440 overwriteable minute slots plus recent session activity in a plugin-private `node:sqlite` database. A Typert remote returns one atomic snapshot to a Web client that registers a sidebar footer action and a full-frame dashboard overlay with Overview, DSH, Host, and Chat sections.

**Tech Stack:** TypeScript 6, Node.js 24 (`node:sqlite`, `node:os`, `node:fs`), Cordis, Typert remotes, React 19, inline SVG charts, Vitest, pnpm 11.

## Global Constraints

- The visible range is always the rolling last 24 hours.
- Host values sample every 5 seconds; persisted history contains one-minute aggregates only.
- Time-series storage contains exactly 1,440 overwriteable slots and never appends one row per elapsed minute forever.
- Token total is `inputTokens + outputTokens + reasoningTokens`; the series preserves all three components.
- Session count is the exact number of distinct sessions active in the last 24 hours.
- Chat count includes terminal `turn/end` events; `reason.kind === 'completed'` is success and every other terminal reason is failure.
- Every requested metric has both a numeric value and a chart.
- Chat success is green and extends upward; failure is red and extends downward; success rate has a separate percentage scale.
- macOS and Linux collect host metrics. Windows returns `coming_soon` for Host while DSH and Chat remain available.
- Missing CPU temperature returns `unavailable` for temperature only.
- Persist no prompt, response, title, workspace, tool content, credential, or user label.
- Do not modify `deepseek-harness-source`; consume its published peer interfaces.

## File Structure

Create one focused package at `plugins/resource-dashboard`:

- `src/types.ts`: wire-safe metric, point, capability, and snapshot types.
- `src/aggregate.ts`: minute mapping, DSH event projection, host accumulator, and snapshot math.
- `src/store.ts`: `node:sqlite` schema, ring-slot upserts, recent-session pruning, snapshot transaction, and maintenance.
- `src/host-reader.ts`: platform-independent reader interface and macOS/Linux/Windows implementations.
- `src/host-collector.ts`: five-second scheduling and minute aggregation.
- `src/dsh-collector.ts`: contained `session/event` listener and store writes.
- `src/remote.ts`: Typert snapshot service.
- `src/index.ts`: configuration, lifecycle composition, and exports.
- `src/client/index.tsx`: remote mount, polling lifecycle, footer/overlay registrations, and local open state.
- `src/client/dashboard.tsx`: section navigation and metric presentation.
- `src/client/charts.tsx`: accessible responsive SVG primitives.
- `src/client/style.ts`: one idempotent stylesheet.
- `src/client/locales.ts`: Chinese and English strings.
- `src/client/slot-options.ts`: stable sidebar and overlay registration identities.
- `tests/*.spec.ts(x)`: pure, storage, platform, integration, client, and package tests.
- Build/package files mirror `plugins/nextcloud` and are kept package-local.

Repository integration modifies `package.json` and `Makefile` only to add `resource-dashboard:pack` and `PLUGIN=resource-dashboard` support.

---

### Task 1: Package Scaffold and Metric Contracts

**Files:**
- Create: `plugins/resource-dashboard/package.json`
- Create: `plugins/resource-dashboard/pnpm-workspace.yaml`
- Create: `plugins/resource-dashboard/tsconfig.json`
- Create: `plugins/resource-dashboard/tsconfig.build.json`
- Create: `plugins/resource-dashboard/tsdown.config.ts`
- Create: `plugins/resource-dashboard/scripts/clean.mjs`
- Create: `plugins/resource-dashboard/src/types.ts`
- Create: `plugins/resource-dashboard/src/aggregate.ts`
- Test: `plugins/resource-dashboard/tests/aggregate.spec.ts`

**Interfaces:**
- Consumes: `SessionEvent` and `TokenUsage` from `@deepseek-ai/dsh-session` and `@deepseek-ai/dsh-llm` peer packages.
- Produces: `MinuteBucket`, `HostSample`, `DashboardSnapshot`, `minuteOf(timeMs)`, `slotOf(minute)`, `emptyBucket(minute)`, `applySessionEvent(bucket, event)`, and `HostMinuteAccumulator`.

- [ ] **Step 1: Write the failing minute and DSH aggregation tests**

```ts
import { describe, expect, it } from 'vitest'
import { applySessionEvent, emptyBucket, minuteOf, slotOf } from '../src/aggregate.ts'

describe('resource aggregation', () => {
  it('maps absolute minutes into exactly 1440 reusable slots', () => {
    expect(minuteOf(120_000)).toBe(2)
    expect(slotOf(2)).toBe(2)
    expect(slotOf(1_442)).toBe(2)
  })

  it('folds token usage and terminal chat outcomes without content', () => {
    const bucket = emptyBucket(10)
    applySessionEvent(bucket, { type: 'assistant/message', time: 600_001, seq: 1, data: {
      turn: 1, step: 1, message: { role: 'assistant', content: [] },
      usage: { inputTokens: 7, outputTokens: 3, reasoningTokens: 2 },
    } } as never)
    applySessionEvent(bucket, { type: 'turn/end', time: 600_002, seq: 2,
      data: { turn: 1, reason: { kind: 'completed' } } } as never)
    applySessionEvent(bucket, { type: 'turn/end', time: 600_003, seq: 3,
      data: { turn: 2, reason: { kind: 'aborted' } } } as never)
    expect(bucket).toMatchObject({ inputTokens: 7, outputTokens: 3, reasoningTokens: 2, chatSuccess: 1, chatFailure: 1 })
  })
})
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/aggregate.spec.ts`

Expected: FAIL because `src/aggregate.ts` does not exist.

- [ ] **Step 3: Define the wire contracts and minimal pure aggregation**

```ts
export const RETENTION_MINUTES = 1_440

export interface MinuteBucket {
  minute: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  chatSuccess: number
  chatFailure: number
  cpuAvg: number | null
  cpuMax: number | null
  memoryUsedAvg: number | null
  memoryTotal: number | null
  diskUsed: number | null
  diskTotal: number | null
  temperatureAvg: number | null
  temperatureMax: number | null
}

export type MetricAvailability = 'available' | 'unavailable' | 'coming_soon' | 'stale'
export interface MetricState<T> { value: T | null; availability: MetricAvailability; sampledAt: number | null }
export interface HostSample { sampledAt: number; cpu: number; memoryUsed: number; memoryTotal: number; diskUsed: number; diskTotal: number; temperature: number | null }
export interface DashboardSnapshot {
  generatedAt: number
  window: { fromMinute: number; throughMinute: number }
  totals: { inputTokens: number; outputTokens: number; reasoningTokens: number; sessions: number; chatSuccess: number; chatFailure: number }
  currentHost: { platform: NodeJS.Platform; cpu: MetricState<number>; memory: MetricState<{ used: number; total: number }>; disk: MetricState<{ used: number; total: number }>; temperature: MetricState<number> }
  series: readonly MinuteBucket[]
  health: { storage: 'ok' | 'degraded'; lastErrorAt: number | null }
}
```

Implement `minuteOf(timeMs) = Math.floor(timeMs / 60_000)`, positive modulo in `slotOf`, zero/null initialization in `emptyBucket`, usage folding only for `assistant/message`, and terminal outcome folding only for `turn/end`.

- [ ] **Step 4: Add host accumulator tests and implementation**

Test that two samples in one minute yield CPU/temperature average and maximum, latest capacity values, and that all-null temperature stays null. Implement `HostMinuteAccumulator.add(sample)` and `finish()` without retaining raw samples.

- [ ] **Step 5: Run the package test and typecheck**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/aggregate.spec.ts`

Run: `corepack pnpm --dir plugins/resource-dashboard exec tsc -p tsconfig.json --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit the contracts and aggregation unit**

```bash
git add plugins/resource-dashboard
git commit -m "feat: scaffold resource dashboard metrics"
```

---

### Task 2: Fixed-Slot SQLite Store

**Files:**
- Create: `plugins/resource-dashboard/src/store.ts`
- Test: `plugins/resource-dashboard/tests/store.spec.ts`

**Interfaces:**
- Consumes: `MinuteBucket`, `HostSample`, `DashboardSnapshot`, `RETENTION_MINUTES`, and `slotOf` from Task 1.
- Produces: `MetricsStore.open(path, now)`, `recordDsh(minute, sessionId, delta)`, `recordHost(bucket)`, `snapshot(now, currentHost)`, `maintain(now)`, and `close()`.

- [ ] **Step 1: Write failing overwrite and retention tests**

```ts
it('overwrites yesterday slot and never returns stale absolute minutes', () => {
  const store = MetricsStore.open(join(dir, 'metrics.sqlite'), () => 1_442 * 60_000)
  store.recordDsh(2, 'old', { inputTokens: 4, outputTokens: 0, reasoningTokens: 0, chatSuccess: 0, chatFailure: 0 })
  store.recordDsh(1_442, 'new', { inputTokens: 9, outputTokens: 0, reasoningTokens: 0, chatSuccess: 1, chatFailure: 0 })
  const snapshot = store.snapshot(1_442 * 60_000, unavailableHost('linux'))
  expect(snapshot.series.filter(point => point.inputTokens > 0)).toEqual([
    expect.objectContaining({ minute: 1_442, inputTokens: 9 }),
  ])
  expect(snapshot.totals.sessions).toBe(1)
})
```

Also test row counts remain `<= 1440`, a session last seen exactly inside the window counts, one just outside does not, and closing/reopening preserves eligible data.

- [ ] **Step 2: Run the store test and verify failure**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/store.spec.ts`

Expected: FAIL because `MetricsStore` is missing.

- [ ] **Step 3: Create the SQLite schema and transactional ring upsert**

Use `DatabaseSync` from `node:sqlite` and create:

```sql
PRAGMA journal_mode = WAL;
PRAGMA auto_vacuum = INCREMENTAL;
CREATE TABLE IF NOT EXISTS minute_metrics (
  slot INTEGER PRIMARY KEY CHECK(slot >= 0 AND slot < 1440),
  minute INTEGER NOT NULL UNIQUE,
  input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, reasoning_tokens INTEGER NOT NULL,
  chat_success INTEGER NOT NULL, chat_failure INTEGER NOT NULL,
  cpu_avg REAL, cpu_max REAL, memory_used_avg REAL, memory_total INTEGER,
  disk_used INTEGER, disk_total INTEGER, temperature_avg REAL, temperature_max REAL
);
CREATE TABLE IF NOT EXISTS session_activity (
  session_id TEXT PRIMARY KEY,
  last_minute INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) WITHOUT ROWID;
```

Before inserting a new absolute minute into its slot, replace every field rather than adding to yesterday's values. For another event in the same absolute minute, increment only DSH counters. Wrap slot mutation, session upsert, and expired-session deletion in one transaction.

- [ ] **Step 4: Implement consistent snapshots and bounded maintenance**

Read totals, exact distinct-session count, and ordered points inside one deferred transaction. Filter minutes with `minute >= minuteOf(now) - 1439` and `minute <= minuteOf(now)`. Return gaps as zero DSH/null host buckets generated in memory.

`maintain(now)` must delete expired sessions, execute `PRAGMA incremental_vacuum(32)`, run `PRAGMA wal_checkpoint(TRUNCATE)`, and store only a bounded last-error timestamp/code in memory—not in growing log rows.

- [ ] **Step 5: Add a 30-day synthetic stability test**

Write one host bucket and one DSH delta for each simulated minute across 30 days. Assert `minute_metrics` has exactly 1,440 rows, the returned range is 1,440 points, no point predates the cutoff, and the database plus `-wal` size after maintenance is no larger than a documented fixed ceiling derived from the test fixture.

- [ ] **Step 6: Run focused tests and commit**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/store.spec.ts`

Expected: PASS.

```bash
git add plugins/resource-dashboard/src/store.ts plugins/resource-dashboard/tests/store.spec.ts
git commit -m "feat: add bounded dashboard metric store"
```

---

### Task 3: Cross-Platform Host Sampling

**Files:**
- Create: `plugins/resource-dashboard/src/host-reader.ts`
- Create: `plugins/resource-dashboard/src/host-collector.ts`
- Test: `plugins/resource-dashboard/tests/host-reader.spec.ts`
- Test: `plugins/resource-dashboard/tests/host-collector.spec.ts`

**Interfaces:**
- Consumes: `HostSample`, `HostMinuteAccumulator`, and `MetricsStore.recordHost`.
- Produces: `HostReader.read(): Promise<HostReadResult>`, `createHostReader(platform, dependencies)`, and `HostMetricsCollector.start()/sample()/dispose()`.

- [ ] **Step 1: Write platform capability tests**

Test Linux reading with injected `/proc/stat`, `/proc/meminfo`, `statfs`, and thermal-zone fixtures; macOS with injected `os.cpus()`, `os.totalmem()/freemem()`, `statfs`, and an absent temperature provider; Windows returning `coming_soon` without touching filesystem readers.

```ts
expect(await createHostReader('win32', deps).read()).toEqual({
  platform: 'win32', availability: 'coming_soon', sample: null,
})
```

- [ ] **Step 2: Run tests and verify missing reader failure**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/host-reader.spec.ts`

Expected: FAIL because `createHostReader` is missing.

- [ ] **Step 3: Implement dependency-injected readers**

Compute CPU utilization from deltas between cumulative CPU ticks, memory from `totalmem - freemem`, and disk through `statfs` for the configured volume. Linux temperature reads numeric `thermal_zone*/temp` values and uses the highest valid CPU-like zone; macOS accepts an optional non-privileged sensor provider and otherwise returns null. Clamp percentages to `[0, 100]`, reject negative byte counts, and never shell out with user-controlled arguments.

- [ ] **Step 4: Write scheduler and partial-failure tests**

Use a fake clock to prove sampling occurs at 5,000 ms, two samples in one minute produce one aggregate when the minute changes, disposal clears the timer, a failed read keeps the previous current value stale, and a later success clears stale state.

- [ ] **Step 5: Implement the collector**

`HostMetricsCollector` owns one timer and one `HostMinuteAccumulator`. It catches every reader/store error, updates a bounded health state, never allows an async timer rejection to escape, and flushes a completed partial minute on orderly disposal.

- [ ] **Step 6: Run tests and commit**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/host-reader.spec.ts tests/host-collector.spec.ts`

Expected: PASS.

```bash
git add plugins/resource-dashboard/src/host-reader.ts plugins/resource-dashboard/src/host-collector.ts plugins/resource-dashboard/tests/host-*.spec.ts
git commit -m "feat: collect cross-platform host metrics"
```

---

### Task 4: DSH Event Collector, Remote, and Host Plugin Lifecycle

**Files:**
- Create: `plugins/resource-dashboard/src/dsh-collector.ts`
- Create: `plugins/resource-dashboard/src/remote.ts`
- Create: `plugins/resource-dashboard/src/index.ts`
- Create: `plugins/resource-dashboard/src/remote-types.ts`
- Create: `plugins/resource-dashboard/scripts/generate-typert.mjs`
- Create: `plugins/resource-dashboard/cordis.patch.yml`
- Test: `plugins/resource-dashboard/tests/dsh-collector.spec.ts`
- Test: `plugins/resource-dashboard/tests/remote.spec.ts`
- Test: `plugins/resource-dashboard/tests/host-plugin.spec.ts`

**Interfaces:**
- Consumes: Cordis `session/event`, `Session.id`, `SessionEvent.data.usage`, `MetricsStore`, and `HostMetricsCollector`.
- Produces: `DshMetricsCollector`, `ResourceDashboardRemote.snapshot()`, and plugin `apply(ctx, config)`.

- [ ] **Step 1: Write failing event containment tests**

Create a Cordis test context, emit `assistant/message` and `turn/end` for two sessions, and assert the store receives only numeric deltas plus `String(session.id)`. Configure the fake store to throw once and verify a later Cordis listener still runs and the next event is recorded.

- [ ] **Step 2: Implement contained DSH collection**

Subscribe through `ctx.on('session/event', ...)`. Ignore all event types except `assistant/message` with usage and `turn/end`. Convert each supported event with the pure Task 1 projector and call `recordDsh(minuteOf(event.time), String(session.id), delta)` inside a try/catch that updates health without rethrowing into Cordis's stop-on-throw event chain.

- [ ] **Step 3: Write and implement the Typert remote**

Expose exactly one method:

```ts
export class ResourceDashboardRemote extends TypertRemoteService {
  constructor(ctx: Context, private readonly snapshotProvider: () => DashboardSnapshot) {
    super(ctx, 'resourceDashboard')
  }

  @Remote('snapshot') snapshot(): DashboardSnapshot {
    return this.snapshotProvider()
  }
}
```

Test the remote returns 1,440 ordered points and no session identifiers or content fields. Generate `lib/typert.host.*` and `lib/typert.remote-client.*` with the same isolated analyzer flow used by `plugins/nextcloud/scripts/generate-typert.mjs`, renamed for `dsh-resource-dashboard`.

- [ ] **Step 4: Compose plugin lifecycle and configuration**

Define config `{ dataPath?: string; diskPath?: string; sampleIntervalMs?: number }`, with production defaults resolved to `dshHomePath('plugins', 'resource-dashboard', 'metrics.sqlite')`, `/` for disk, and exactly `5000` ms. Set `inject = ['sessions']`; use the optional loader-provided `dshHomePath` function and fail with an explicit unavailable state if neither it nor `dataPath` is available.

Open the store, construct remote before async work, start both collectors, schedule maintenance once per hour, and close timer/collectors/store through one `ctx.effect` disposer. The patch inserts plugin id `resource-dashboard`, package `dsh-resource-dashboard`, and default config `{}`.

- [ ] **Step 5: Run lifecycle tests and commit**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/dsh-collector.spec.ts tests/remote.spec.ts tests/host-plugin.spec.ts`

Run: `corepack pnpm --dir plugins/resource-dashboard run build:host`

Expected: PASS.

```bash
git add plugins/resource-dashboard
git commit -m "feat: expose resource dashboard metrics"
```

---

### Task 5: Client Polling and Independent Dashboard Surface

**Files:**
- Create: `plugins/resource-dashboard/src/client/index.tsx`
- Create: `plugins/resource-dashboard/src/client/dashboard.tsx`
- Create: `plugins/resource-dashboard/src/client/locales.ts`
- Create: `plugins/resource-dashboard/src/client/slot-options.ts`
- Test: `plugins/resource-dashboard/tests/client-controller.spec.ts`
- Test: `plugins/resource-dashboard/tests/client-slot.spec.ts`

**Interfaces:**
- Consumes: generated `remote.resourceDashboard.snapshot()`, `sidebar.footer.action`, and `shell.overlay` slots.
- Produces: `DashboardController`, `RESOURCE_DASHBOARD_ACTION_SLOT`, `RESOURCE_DASHBOARD_OVERLAY_SLOT`, and `DashboardRoot`.

- [ ] **Step 1: Write failing polling-controller tests**

Test that `start()` performs an immediate snapshot, schedules the next read after 5 seconds, atomically replaces the whole snapshot, retains the last good snapshot with a stale error on failure, recovers on the next success, and `dispose()` prevents future reads.

- [ ] **Step 2: Implement the external-store controller**

Expose `{ getSnapshot, subscribe }` for `useSyncExternalStore`, plus `start` and `dispose`. Keep `{ snapshot, loading, error }` as one immutable state object. Use one in-flight request at a time and schedule the next poll after completion rather than overlapping intervals.

- [ ] **Step 3: Write stable slot tests**

```ts
expect(RESOURCE_DASHBOARD_ACTION_SLOT).toEqual({
  name: 'sidebar.footer.action', id: 'resource-dashboard-action', order: -10,
  locale: 'resource-dashboard',
})
expect(RESOURCE_DASHBOARD_OVERLAY_SLOT).toEqual({
  name: 'shell.overlay', id: 'resource-dashboard-overlay', order: 10,
  locale: 'resource-dashboard',
})
```

- [ ] **Step 4: Register an independent overlay page**

Mount the generated remote, register Chinese/English dictionaries, and create one plugin-local open-state controller. The footer action renders an icon plus “资源看板” when wide and icon-only when collapsed. The overlay renders nothing while closed and a full-frame dialog while open; Escape, close button, and backdrop close it. This is independent of Settings and never replaces `conversation` or `sidebar` owners.

- [ ] **Step 5: Run client lifecycle tests and commit**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/client-controller.spec.ts tests/client-slot.spec.ts`

Expected: PASS.

```bash
git add plugins/resource-dashboard/src/client plugins/resource-dashboard/tests/client-*.spec.ts
git commit -m "feat: add resource dashboard client surface"
```

---

### Task 6: Responsive Numbers and Semantic Charts

**Files:**
- Create: `plugins/resource-dashboard/src/client/charts.tsx`
- Create: `plugins/resource-dashboard/src/client/style.ts`
- Modify: `plugins/resource-dashboard/src/client/dashboard.tsx`
- Test: `plugins/resource-dashboard/tests/charts.spec.tsx`
- Test: `plugins/resource-dashboard/tests/dashboard.spec.tsx`
- Test: `plugins/resource-dashboard/tests/client-style.spec.ts`

**Interfaces:**
- Consumes: `DashboardSnapshot` and the section/open state from Task 5.
- Produces: `StackedAreaChart`, `LineChart`, `MemoryAreaChart`, `DiskDonut`, `DivergingChatChart`, metric cards, and four dashboard sections.

- [ ] **Step 1: Write failing chart-semantic tests**

Render fixture data and assert accessible chart names, token series labels, null temperature gaps, and separate success-rate scale. For Chat, assert success rectangles carry `data-direction="up" data-series="success"`, failures carry `data-direction="down" data-series="failure"`, and their computed y coordinates lie on opposite sides of the zero axis.

- [ ] **Step 2: Implement reusable responsive SVG charts**

Use `viewBox` plus `ResizeObserver`-sized containers, real `<title>`/`<desc>`, SVG paths generated from the 1,440 points, and pointer/focus tooltips that display timestamp and units. Downsample only for rendered geometry while retaining exact tooltip/source data. Use CSS variables for all colors; define success green and failure red once.

- [ ] **Step 3: Write dashboard content tests**

Assert Overview contains eight numeric cards and eight compact charts; DSH contains Token, Sessions, and Chat activity; Host contains CPU, Memory, Disk, and Temperature; Chat contains numeric success/failure/rate plus the diverging chart. Assert Windows Host renders “待开发中” while DSH remains present and unavailable temperature renders “不可用”, never `0°C`.

- [ ] **Step 4: Implement sections, formatting, and responsive CSS**

Use a local left rail for Overview/DSH/Host/Chat. Format bytes in binary units, tokens with locale-aware compact notation plus exact tooltip, percent with one decimal, and temperature in Celsius. At widths below 760px, move section navigation to a wrapping top row and stack charts; prohibit horizontal page overflow.

- [ ] **Step 5: Run client tests and commit**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/charts.spec.tsx tests/dashboard.spec.tsx tests/client-style.spec.ts`

Expected: PASS.

```bash
git add plugins/resource-dashboard/src/client plugins/resource-dashboard/tests/charts.spec.tsx plugins/resource-dashboard/tests/dashboard.spec.tsx plugins/resource-dashboard/tests/client-style.spec.ts
git commit -m "feat: render semantic resource charts"
```

---

### Task 7: Packaging and Repository Integration

**Files:**
- Create: `plugins/resource-dashboard/README.md`
- Create: `plugins/resource-dashboard/LICENSE`
- Create: `plugins/resource-dashboard/tests/package.spec.ts`
- Modify: `plugins/resource-dashboard/package.json`
- Modify: `package.json`
- Modify: `Makefile`

**Interfaces:**
- Consumes: all host/client outputs from Tasks 1–6 and the repository's generic plugin pack/install targets.
- Produces: `dsh-resource-dashboard-0.1.0.tgz`, `pnpm resource-dashboard:pack`, and `make pack-plugin PLUGIN=resource-dashboard`.

- [ ] **Step 1: Write failing manifest and Make integration tests**

Assert the package declares host entry, `./client`, `./remote-types`, Node `>=24`, required peer dependencies, browser injection packages, bundled runtime dependencies only when actually used, and files limited to `lib`, patch, README, and LICENSE. Run `make -n pack-plugin PLUGIN=resource-dashboard` and expect `pnpm resource-dashboard:pack`.

- [ ] **Step 2: Complete package/build metadata**

Mirror the proven Nextcloud build chain: host `tsc`, Typert generator, browser `tsdown`, clean, test, and prepack. Externalize React, Cordis, slots, primitives, runtime, and remotes. Add the root pack script and Make conditional, and include `resource-dashboard` in help text.

- [ ] **Step 3: Write privacy and operating-system documentation**

Document the exact 24-hour definitions, 5-second/1-minute cadence, 1,440-slot overwrite behavior, database location, macOS/Linux support, Windows coming-soon state, temperature degradation, and the fact that message/tool content is never stored.

- [ ] **Step 4: Build and inspect the archive**

Run: `corepack pnpm --dir plugins/resource-dashboard install --lockfile-only`

Run: `corepack pnpm --dir plugins/resource-dashboard run build`

Run: `corepack pnpm --dir plugins/resource-dashboard pack --pack-destination /tmp`

Run: `tar -tzf /tmp/dsh-resource-dashboard-0.1.0.tgz`

Expected: archive contains `package/lib/index.js`, `package/lib/client.js`, Typert faces, patch, README, and LICENSE; it contains no `src/` or tests.

- [ ] **Step 5: Run package tests and commit**

Run: `corepack pnpm --dir plugins/resource-dashboard exec vitest run tests/package.spec.ts`

Expected: PASS.

```bash
git add plugins/resource-dashboard package.json pnpm-lock.yaml Makefile
git commit -m "build: package resource dashboard plugin"
```

---

### Task 8: Full Verification and Knowledge Reconciliation

**Files:**
- Modify only files required by failures found in the commands below.

**Interfaces:**
- Consumes: the complete plugin and repository integration.
- Produces: verified build, tests, archive, and updated metadata-only project relationships.

- [ ] **Step 1: Run the complete plugin suite**

Run: `corepack pnpm --dir plugins/resource-dashboard test`

Expected: PASS with no unhandled rejection or timer leak.

- [ ] **Step 2: Run typecheck and production build**

Run: `corepack pnpm --dir plugins/resource-dashboard exec tsc -p tsconfig.json --noEmit`

Run: `corepack pnpm --dir plugins/resource-dashboard run build`

Expected: PASS.

- [ ] **Step 3: Run repository packaging regression tests**

Run: `corepack pnpm test -- packaging/makefile.spec.ts`

Run: `corepack pnpm --dir apps/desktop test`

Expected: PASS.

- [ ] **Step 4: Verify retention and privacy statically**

Run: `rg -n "prompt|message\.content|tool/(call|result)|title|workspace" plugins/resource-dashboard/src`

Expected: no persistence path reads or writes these fields; the sole `assistant/message` use reads `event.data.usage` only.

Run: `rg -n "1440|RETENTION_MINUTES|wal_checkpoint|incremental_vacuum" plugins/resource-dashboard/src plugins/resource-dashboard/tests`

Expected: fixed slot count, read cutoff, overwrite test, vacuum, and WAL truncation are all present.

- [ ] **Step 5: Reconcile verified project knowledge and validate it**

Record only the implemented relations: plugin `apply` subscribes to `session/event`; both collectors write `MetricsStore`; `ResourceDashboardRemote` reads it; the client remote feeds `DashboardController`; controller feeds `DashboardRoot`; the two slot registrations expose the surface. Run project-knowledge `reconcile` and `validate`, and do not touch unrelated stale entries.

- [ ] **Step 6: Review the diff and commit verification fixes**

Run: `git diff --check`

Run: `git status --short`

If verification required changes, commit only those changes:

```bash
git add plugins/resource-dashboard package.json pnpm-lock.yaml Makefile
git commit -m "test: verify resource dashboard plugin"
```
