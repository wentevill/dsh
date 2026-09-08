# DSH Cron Plugin Design

## Goal

Add an independent `dsh-cron` plugin that runs persistent, Workspace-bound Cron
tasks for the lifetime of a running DeepSeek Harness process. A task can either
queue work into one fixed Session or create a fresh Session for every
execution. Users can manage tasks from the Session conversation transcript, and
the model can query and mutate them through narrow Cron-specific tools. The
manager is an expandable card inside the conversation transcript.

This is not an offline scheduler. Nothing executes while DSH is stopped. On the
next start, each active Cron can produce at most one delayed catch-up execution
for the downtime window.

## Non-Goals

- Do not extend or migrate `@deepseek-ai/dsh-schedule`.
- Do not run a daemon, launch agent, operating-system service, or second desktop
  runtime outside DSH.
- Do not modify, fork, patch, publish, or write through any DeepSeek Harness
  checkout. Do not update the pinned upstream revision for this feature.
- Do not pre-authorize tools used by a Cron-triggered Run.
- Do not add history retention or cleanup policy in the first version.
- Do not support seconds, Quartz fields, macros, retries, or distributed Cron.

## Product Semantics

Every Cron is permanently bound to the Workspace selected when it is created.
The creator chooses one execution mode:

- `existing_session`: queue every execution into the Session that is current
  when this execution mode is selected.
- `new_session`: create a new Session for every execution in the same Workspace
  using the Agent preset captured when the Cron was created.

Cron syntax is POSIX-style five-field crontab syntax with wildcards, lists,
ranges, and steps. Day-of-month and day-of-week use OR semantics. Each Cron
stores an explicit IANA timezone. Creation defaults to the browser timezone,
and later operating-system timezone changes do not alter the task.

The first version retains every Cron definition and execution record. Deletion
is terminal: it stops future triggers and clears pending work, but retains the
definition and history in a deleted state. A deleted Cron cannot be restored;
the user recreates it instead.

## Package and Ownership Boundary

`dsh-cron` is one standalone plugin package under `plugins/cron`. It contains a
Host entry, Client entry, generated Typert Remote contract, plugin manifest,
tests, and packaging metadata, following the same independent packaging model
as the existing business plugins.

The Host owns all authoritative behavior:

- `CronStore` owns durable definitions, runtime checkpoints, pending
  occurrences, and execution history.
- `CronRuntime` adapts `node-cron` tasks to the durable records.
- `CronCommandService` validates and serializes all queries and mutations.
- `CronExecutionService` resolves or creates Sessions, submits prompts, and
  follows their terminal results.
- `CronRemote` exposes browser-safe snapshots and explicit user-gesture
  commands.

The Client owns presentation and user intent only. It registers one keyed
`tool.call.toolview` contribution for `cron_open_manager`; it never computes
schedules, selects a Workspace on behalf of the Host, or writes persistence
directly.

## Official UI Seam Boundary

The pinned DSH UI currently has a single top-level `details` occupant owned by
chat and one single tool-details child slot. A standalone plugin cannot safely
install a Cron manager there without replacing first-party details behavior.

`dsh-cron` therefore uses only the existing keyed `tool.call.toolview` seam. It
does not register `conversation.details.tool`, replace the core DetailsPanel,
register a new Conversation View, rewrite runtime sources, or require an
upstream release. The accepted `cron_open_manager` card expands in place inside
the originating tool-call row.

## Scheduling Dependency

`node-cron` 4.x is the authoritative implementation for expression validation,
timezone interpretation, daylight-saving behavior, next-run calculation, and
live process timers. `dsh-cron` must not implement Cron field matching or its
own calendar/timer engine.

Only five-field expressions are accepted even if the dependency accepts a
seconds field. The adapter rejects library extensions outside the product
contract before registering a task.

`node-cron` does not provide durable workflows, cross-restart exactly-once
delivery, the product's latest-pending rule, or Session Run tracking. Those
remain plugin responsibilities. The plugin does not use the library's
`noOverlap` result as the Cron execution state because a scheduling callback
finishes before the corresponding Session Run finishes.

After a task is registered or fires, `CronRuntime` reads `getNextRun()` and
writes the returned instant as a runtime checkpoint. The plugin never advances
that checkpoint with handwritten Cron arithmetic. It is not part of the user
definition and can always be rebuilt from the library.

## Durable Model

The definition record contains:

```ts
interface CronDefinition {
  id: CronId
  workspaceId: WorkspaceId
  name: string
  expression: string
  timezone: string
  prompt: string
  executionMode: 'existing_session' | 'new_session'
  createdFromSessionId: SessionId
  targetSessionId?: SessionId
  agentPresetId?: AgentPresetId
  state: 'active' | 'paused' | 'deleted'
  revision: number
  createdAt: string
  updatedAt: string
  deletedAt?: string
}
```

`workspaceId` and `createdFromSessionId` are immutable. An existing-Session
definition requires `targetSessionId`, which the Host derives from the invoking
Session. A new-Session definition requires `agentPresetId`, which the Host
captures from the invoking Session's current Agent preset. An update that
switches mode captures the new target from that update's invoking Session; the
model and Client cannot provide either stored target directly.

Runtime state is stored separately so the user definition does not pretend to
own schedule calculations:

```ts
interface CronRuntimeState {
  cronId: CronId
  libraryNextRunAt?: string
  observedAt: string
  activeExecutionId?: CronExecutionId
  pendingOccurrence?: CronOccurrence
}
```

`libraryNextRunAt` is copied from `node-cron`; it is never manually incremented.
It is a crash/downtime checkpoint, not an independently calculated schedule.

An execution record contains:

```ts
interface CronExecution {
  id: CronExecutionId
  cronId: CronId
  trigger: 'on_time' | 'startup_catch_up' | 'pending_after_run'
  scheduledFor?: string
  delayed: boolean
  coalescedThrough?: string
  state:
    | 'queued'
    | 'running'
    | 'waiting_approval'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'coalesced'
  sessionId?: SessionId
  sessionRequestId?: SessionRequestId
  failureCode?: CronFailureCode
  startedAt?: string
  finishedAt?: string
}
```

A startup catch-up represents the entire missed window with one delayed record.
Its `scheduledFor` is the durable library checkpoint that first became overdue,
and `coalescedThrough` is the restart observation time. The plugin does not
enumerate missed calendar occurrences or replay a backlog.

History has no first-version deletion path. The schema and query boundary keep
retention as a later policy addition without baking an unlimited array into a
definition row.

## Runtime Lifecycle

When the Host plugin starts, it opens the store and registers one `node-cron`
task for every active definition. Paused and deleted definitions have no live
task. Registration records the library's next-run checkpoint.

When `node-cron` invokes a task:

1. `CronRuntime` serializes handling by Cron ID.
2. It creates and persists the `CronExecution` record for the occurrence.
3. It refreshes and persists the next-run checkpoint from the library.
4. Only after both durable writes complete does it submit the Session request.
5. If an execution is active or waiting for approval, it stores the occurrence
   as the single pending occurrence.
6. If a pending occurrence already exists, the old one becomes a `coalesced`
   history record and the new occurrence replaces it.

When the active execution becomes terminal, an active Cron immediately
dispatches its pending occurrence and marks it delayed. A paused or deleted Cron
clears that pending occurrence and records it as coalesced.

Pausing stops the live `node-cron` task and clears pending work. It does not
cancel an active or approval-blocked Session Run. Resuming registers a fresh
library task and records its next-run checkpoint. Deleting destroys the live
task, clears pending work, and marks the definition terminal while allowing an
already active Run to finish.

## Startup Catch-Up

On startup, the runtime reads and retains each active Cron's durable checkpoint
before registering its new library task. If that old `libraryNextRunAt` is later
than the previous observation but not later than startup time, DSH was
unavailable for at least one expected trigger. The runtime creates exactly one delayed
`startup_catch_up` occurrence for the downtime window. It does not calculate or
persist every missed occurrence.

The newly registered `node-cron` task provides the next future run. The startup
catch-up then follows the same single-flight path as a live trigger. If an
unfinished execution is recovered first, the catch-up becomes the one pending
occurrence.

## Session Execution

For `existing_session`, the Host verifies that `targetSessionId` still belongs
to the Cron's Workspace and resolves that exact Session. If it is absent or
unavailable, only the current execution fails with
`target_session_unavailable`; the Host does not choose another Session or pause
the Cron.

For `new_session`, the Host derives a stable Session identity from the execution
identity, creates or adopts that Session idempotently, attaches it to the bound
Workspace, and applies the stored Agent preset. The permission mode is always
the safe `request approval` default. It never inherits Full access from the
creating Session or a previous execution Session.

The execution prompt is submitted in queue mode. It does not steer or interrupt
an active turn. Different Cron definitions may execute concurrently. Multiple
Crons targeting the same Session obey that Session's normal inbox ordering.

Cron-triggered Runs use the target Session's ordinary approval system. A Run
waiting for approval remains active for single-flight purposes, has no Cron
timeout, and can only be cancelled from its Session.

## Dispatch Recovery and Correlation

Before submitting a prompt, the plugin persists an execution identity and
derives a stable `SessionRequestId` from it. The Session controller persists
that request identity on the accepted user message as `rpcId`.

After a crash, the plugin inspects the target Session before resubmitting an
uncertain execution:

- If the same `rpcId` is already present, it adopts and follows the original
  Session work.
- If it is absent, it resubmits with the same stable request identity.

For new-Session mode, the Session ID is also derived and persisted before
creation, so recovery adopts rather than creates a second Session.

Execution state follows the correlated user message and its turn through
`turn/end`. Completed turns succeed; error terminal reasons fail; user
cancellation becomes cancelled. Tool approval requests hold the execution in
`waiting_approval` until the Session continues.

This closes the practical retry window using durable DSH identities but does
not claim a cross-store transactional exactly-once guarantee.

## Tools and Approval Policy

The plugin registers only narrow Cron-specific tools:

- `cron_list`
- `cron_history`
- `cron_open_manager`
- `cron_create`
- `cron_update`
- `cron_delete`
- `cron_pause`
- `cron_resume`

`cron_list` accepts `related`, `all`, or `deleted` scope. Related results include
Crons created from the current Session, Crons fixed to the current Session, and
the originating Cron when the current Session was created for one of its
executions. `cron_history` uses cursor pagination but does not delete records.

`cron_open_manager` returns a suggestion card rather than opening UI as a side
effect. When the model recognizes Cron-management intent it calls this tool;
the Client expands the tool row into the manager only after the user accepts
the card.

Model-driven create, update, delete, and resume require confirmation for every
operation. Model-driven pause may execute without confirmation. Query and open
suggestion tools do not require confirmation.

Explicit controls in the expanded manager are direct user gestures and count as
authorization, so they do not enter a second Agent approval flow. All tool and
Remote mutations nevertheless call the same `CronCommandService` and share
validation, serialization, audit, and persistence behavior.

Typert Remote DTOs use plain JSON strings for Cron, execution, Session,
Workspace, and preset identifiers. Internal TypeScript brands never cross the
wire; `CronRemote` restores plugin-owned Cron brands before calling the command
service. This keeps generated codecs valid for ordinary browser JSON values.

## Workspace and Validation Boundary

The model and Client cannot provide an authoritative Workspace ID, fixed target
Session ID, or captured Agent preset ID. The Host derives them from the invoking
Session and writes `createdFromSessionId` itself. Every target Session and Cron
ID is checked against that Workspace.

Foreign and unknown Cron IDs return the same minimal not-found failure. The Host
does not reveal whether an object exists in another Workspace. Invalid context,
expression, timezone, target Session, execution mode, or Agent preset fails
closed. No fallback Workspace, Session, preset, timezone, or permission is
guessed.

Stable public failure codes include:

- `cron_not_found`
- `invalid_expression`
- `invalid_timezone`
- `workspace_context_unavailable`
- `target_session_unavailable`
- `agent_preset_unavailable`
- `model_unavailable`
- `prompt_rejected`
- `persistence_unavailable`
- `internal_error`

Messages are bounded and contain no filesystem paths, foreign identifiers,
prompts, tool arguments, or provider secrets.

## In-Conversation Client Manager

The settled `cron_open_manager` tool row first renders a compact suggestion
card. Accepting it changes only plugin-local Client state and expands that same
row into the manager. The manager receives the tool call's Session identity and
initially shows `related` Cron definitions for the current Workspace. Users can
switch to `all` or `deleted`, or collapse back to the suggestion card.

Selecting a Cron shows its definition, timezone, mode, current state, control
actions, and execution history inside the expanded row. An execution created in
new-Session mode links to its Session. An active fixed-Session execution links
to that fixed Session. Deleted definitions are read-only.

The Client renders Host snapshots and stable failure states. It does not infer
active execution state from local timers or optimistically invent durable
history. Live updates replace snapshots by revision so an older response cannot
overwrite a newer command result.

## Relationship to `dsh-schedule`

The packages remain independent and may coexist:

- `dsh-schedule` owns Session-local after, at, and fixed-rate reminders stored
  in that Session's event log.
- `dsh-cron` owns Workspace-bound Cron definitions and global Host lifecycle.

There is no import, compatibility alias, shared store, or automatic migration.
The desktop profile may enable only `dsh-cron`.

## Failure Behavior

A schedule, target, preset, model, prompt, or persistence failure affects only
the current operation or execution unless the store itself cannot be opened.
Ordinary execution failures do not pause the Cron. A later scheduled trigger is
still eligible.

If the store cannot initialize safely, the runtime registers no tasks and the
manager reports an unavailable state. It must not run from partial or guessed
state. A failed mutation preserves the last committed definition and reports a
minimal error.

If library task registration fails for one definition, that Cron reports a
runtime failure without preventing unrelated Cron tasks from loading. The Host
does not silently replace `node-cron`, evaluate fields itself, or fall back to a
different timezone.

## Testing

Pure domain tests cover definition invariants, immutable Workspace ownership,
mode-specific targets, revisions, deleted-state finality, pending replacement,
and coalesced history.

The `node-cron` adapter is tested with a fake clock and the real library for:

- accepted five-field wildcard, list, range, and step expressions;
- rejection of seconds, macros, and unsupported extensions;
- day-of-month/day-of-week behavior;
- explicit timezone handling and daylight-saving transitions;
- task registration, stop, start, destroy, and next-run checkpoints;
- one startup catch-up for an overdue downtime checkpoint.

Execution tests cover fixed and new Session modes, deterministic Session and
request identities, Workspace attachment, safe permission defaults, queued
delivery, approval waits, terminal outcome correlation, target disappearance,
and crash recovery before and after prompt admission.

Concurrency tests cover one active Run per Cron, one latest pending occurrence,
replacement of older pending occurrences, active completion dispatch, and
pause/delete while a Run is active.

Security and tool tests cover strict schemas, the confirmation matrix,
server-derived Workspace context, foreign-ID indistinguishability, stable
failure codes, and direct-user Remote commands using the same command path.

Client tests cover suggestion acceptance, in-row expansion/collapse,
related/all/deleted filters, controls, history pagination, execution Session
links, stale response rejection, and unavailable states. They also assert that
the plugin registers only `tool.call.toolview` and never a details replacement.

Packaging acceptance builds and packs the standalone plugin, installs it
through the bundled DSH plugin flow, boots a real Host/Client composition,
creates both execution modes, observes a trigger, pauses and resumes a task,
and confirms the pinned upstream checkout remains clean and pinned to the same
revision.

## Acceptance Criteria

- `dsh-cron` is independently packaged and contains all Cron business logic.
- Cron parsing, timezone behavior, next-run calculation, and live timers come
  from `node-cron`; the plugin contains no Cron calendar implementation.
- Every Cron is permanently scoped to its creation Workspace.
- Both fixed-Session and fresh-Session-per-execution modes work, with fresh
  Sessions using the captured preset and request-approval permissions.
- Each Cron has at most one active execution and one latest pending occurrence.
- DSH downtime produces at most one delayed catch-up per active Cron and never
  replays a backlog.
- Pause and delete do not cancel an active Session Run; delete is terminal and
  retains definition and history.
- Model mutations follow the approved confirmation matrix, while explicit
  expanded-manager gestures do not receive duplicate approval prompts.
- Users can open the manager from an accepted conversation suggestion and view
  related, all, deleted, and execution-history states inside that tool row.
- Missing or foreign resources fail closed without fallback or information
  disclosure.
- Existing `dsh-schedule` behavior and data remain untouched.
- Packaging and canary verification leave the pinned upstream checkout
  unchanged, and the implementation requires no DeepSeek Harness modification
  or release.
