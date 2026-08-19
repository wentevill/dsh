# WeCom WebSocket Room Sessions

## Goal

Extend `dsh-wecom` with an independently managed WeCom AI Bot WebSocket
channel. Each WeCom room maps to exactly one durable DeepSeek Harness session,
messages from that room are processed in order, and replies reference the
originating WeCom message.

All channel code, dependencies, state, settings, and lifecycle ownership belong
to the WeCom plugin. The implementation does not modify Harness upstream source.

## Scope

The first channel release handles direct messages and group messages that
explicitly mention the bot. It accepts text, voice transcription, mixed text,
image, and file callbacks. It does not persist message bodies or attachment
content outside the canonical Harness session log. Active outbound notifications
remain the responsibility of the existing `message.aibot.send` CLI tool.

Video normalization, proactive channel broadcasts, cross-bot room sharing, and
message-history import are outside this release.

## Ownership and Dependencies

The plugin uses the official `@wecom/aibot-node-sdk` behind a narrow adapter.
The adapter owns SDK construction, subscription, callback registration, reply,
heartbeat observation, and shutdown. SDK types do not escape the adapter, which
keeps the connection state machine deterministic under tests and limits future
SDK migration to one module.

The plugin consumes Harness services through injection:

- `ctx.storageDomain` for the typed room-to-session mapping;
- the canonical Harness session coordinator and persistence services for session
  creation, restoration, submission, and durable history;
- the Harness agent service for running an inbound turn;
- the Harness credential service for Bot ID and Bot Secret.

Bot Secret never enters settings, Remote responses, logs, storage-domain rows,
session events, subprocess argv, or model-visible tool data.

## Unified Authorization

The existing authorization card remains the single entry point. QR completion
must provide Bot ID and Bot Secret, store them through the Harness credential
service, provision the CLI authorization, and then start the channel. No manual
Bot Secret field is added.

CLI API synchronization and the WebSocket channel have independent substates.
A CLI schema failure does not stop an already authenticated channel, and a
temporary channel failure does not remove CLI tools. Deleting authorization
stops the channel and removes Bot credentials and CLI-owned authorization files,
but deliberately retains room-to-session mappings. Reauthorizing the same Bot
ID therefore resumes the same sessions; a different Bot ID uses distinct keys.

## Connection State Machine

The channel exposes these states:

```text
stopped -> connecting -> subscribing -> connected
              ^                           |
              |                           v
              +------ reconnect_wait <---+

connecting/subscribing/connected -> auth_failed
any state -> stopped
```

`connected` is published only after the WebSocket is open and the bot subscribe
request has received a successful acknowledgement. TCP close, WebSocket error,
DNS or TLS interruption, subscribe timeout, and heartbeat timeout all enter one
disconnect path and then `reconnect_wait`. Credential rejection or a permanently
disabled bot enters `auth_failed` and does not retry until credentials change.

Retry uses exponential backoff with jitter: nominal delays of 1, 2, 4, 8, 15,
and 30 seconds, capped at 30 seconds. A connection that stays subscribed for a
stable interval resets the attempt counter. A network-restored signal may
cancel the current delay and request one immediate attempt, but it cannot create
a second concurrent connection attempt.

## Lifecycle and Orphan Prevention

Each start creates one channel generation with an `AbortController`. A plugin
instance owns at most one active generation. The socket, SDK listeners,
heartbeat deadline, reconnect timer, connect promise, inbound dispatcher, room
queues, and active reply operations all belong to that generation.

Plugin disposal, authorization deletion, reauthorization, Bot ID change, or an
explicit restart performs the following ordered shutdown:

1. abort the generation and reject new inbound work;
2. cancel heartbeat and reconnect timers;
3. remove SDK listeners;
4. close the WebSocket and wait for its close acknowledgement;
5. wait a bounded time for active room operations;
6. terminate an SDK Worker or underlying transport that did not stop;
7. publish `stopped` only if this is still the current generation.

Every asynchronous callback checks its generation token before changing state,
creating a session, or sending a reply. Late events from an old socket are
ignored. The implementation uses no process-global singleton, untracked timer,
or detached promise.

## Room Identity and Durable Mapping

Room identity is scoped by Bot ID:

```text
group  = bot-id + group + callback chatid
direct = bot-id + direct + callback sender userid
```

The plugin declares a typed `wecom_room_sessions` storage domain. Record keys are
HMAC digests of the scoped room identity using a plugin-owned local salt. Records
contain only the Bot ID digest, room kind, Harness session ID, creation time, and
last-used time. Raw Bot IDs, chat IDs, user IDs, message IDs, message bodies, and
credentials are not stored in this domain.

The plugin accesses the domain only through `ctx.storageDomain`; it does not
select or access a JSON or SQLite backend directly. Domain writes reach durable
storage before the in-memory view changes. The opened domain handle is owned by
the plugin lifetime, not a reconnecting channel generation, and is closed during
plugin disposal. Authorization deletion does not delete its records.

The first message for a room runs a serialized lookup-or-create operation:

1. derive the room digest;
2. read an existing session ID;
3. verify that the referenced Harness session still exists;
4. create a Harness session when absent or stale;
5. persist the mapping before submitting the inbound message.

Concurrent first messages cannot create two sessions. If domain storage cannot
open or a mapping cannot be made durable, the message channel does not start or
does not process that message; it never falls back to an ephemeral mapping.

Harness owns all conversation persistence. The WeCom domain does not duplicate
session messages, outputs, attachments, or summaries. Recent callback message
IDs are held only in a bounded in-process deduplication cache.

## Inbound Processing

The SDK adapter converts callbacks into a plugin-owned envelope containing the
callback request context, message ID, room identity, sender identity, mention
state, normalized text, and bounded attachment descriptors.

Direct messages are accepted immediately. Group messages are accepted only when
the callback says the bot was explicitly mentioned. Unsupported or malformed
callbacks are acknowledged without starting an agent turn and are recorded as
bounded diagnostics without message content.

Accepted messages pass through an in-process `Bot ID + msgid` deduplication
cache. Each room owns a serial promise queue, while different rooms may execute
in parallel under a global concurrency bound. Queue entries have capacity and
age limits so an unavailable agent cannot create unbounded memory growth.

Text and voice transcription become Harness user text. Mixed callbacks preserve
text order. Image and file downloads use the SDK-provided authenticated and
decryption path, enforce byte and time limits, and become Harness attachments.
The normalized turn is submitted to the mapped session and flushed through the
canonical session persistence path.

## Referenced Replies

The bridge collects the final assistant text for the inbound turn and replies
through the original SDK callback/request context. The reply carries the
originating WeCom message ID using the official referenced-reply field; it does
not emulate a quote by copying user text into Markdown.

Only a successful WeCom send acknowledgement marks delivery complete. A stale
callback context, expired reply window, aborted generation, or send timeout is
reported as delivery failure. The channel does not downgrade an expired quoted
reply into an unreferenced proactive message because that could appear in the
wrong conversational context.

## State and Observability

The settings card reports API synchronization and WebSocket state separately.
The channel view includes `disabled`, `stopped`, `connecting`, `subscribing`,
`connected`, `reconnect_wait`, `auth_failed`, and `failed`, plus a bounded safe
diagnostic and next-retry time where applicable. It never exposes credentials,
room identifiers, message identifiers, message content, attachment URLs, or
session transcripts.

## Failure Rules

- Network and server-transient failures retry automatically.
- Authentication and permanent bot-state failures wait for authorization change.
- Storage-domain failure prevents unstable room mapping.
- Missing or deleted Harness sessions are replaced atomically on the next room
  message.
- Agent failure leaves the room mapping intact and sends no fabricated success.
- Reply failure is observable and is not recorded as delivered.
- Queue overflow rejects only the new message for that room and does not reorder
  accepted messages.

## Testing

Unit tests use fake clocks and a fake SDK adapter to cover every state transition,
backoff cap and reset, jitter bounds, heartbeat timeout, network-restored wakeup,
auth failure, late old-generation events, repeated start, and disposal. Resource
tests assert zero active sockets, timers, listeners, workers, queues, and reply
operations after shutdown.

Storage-domain contract tests cover stable digests, Bot isolation, group/direct
separation, durable lookup-or-create, concurrent first messages, missing session
replacement, storage failure, authorization deletion, and same-Bot
reauthorization.

Bridge tests cover direct messages, group mention filtering, in-process duplicate
callbacks, same-room ordering, cross-room concurrency, text/voice/mixed content,
bounded image/file attachments, canonical session flushing, referenced replies,
reply expiry, and delivery acknowledgement failure.

Integration tests assemble the plugin with memory storage, fake credentials,
fake Harness session/agent services, and a fake WebSocket adapter. Release
verification includes the full plugin suite, TypeScript build, package audit,
Makefile installation into the Desktop `web` profile, startup, connection-state
observation, clean shutdown, and installed-version verification.

## Acceptance Criteria

1. A direct chat and a mentioned group chat each reuse one stable Harness session
   across plugin restarts.
2. Different rooms and different Bot IDs never share a session mapping.
3. Same-room turns and replies remain ordered; different rooms can progress
   concurrently within the global bound.
4. Every successful reply references the exact originating WeCom message and is
   accepted by WeCom.
5. TCP/WebSocket interruption reconnects with bounded exponential backoff and
   successful resubscription restores `connected`.
6. Authentication failure stops retrying until credentials change.
7. Disposal, logout, and reauthorization leave no socket, timer, listener,
   Worker, queue, or stale callback able to act.
8. Authorization deletion preserves room mappings but removes Bot credentials
   and CLI authorization.
9. Only room-to-session metadata is stored in `ctx.storageDomain`; conversation
   content remains solely in Harness session persistence.
10. The entire implementation and all new dependencies remain owned by
    `dsh-wecom`.
