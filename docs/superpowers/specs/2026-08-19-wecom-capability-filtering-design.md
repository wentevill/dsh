# WeCom Unified Authorization, Bot Channel, and Capability Filtering

## Goal

Make one WeCom QR authorization configure both the CLI business APIs and the
AI Bot message channel. The plugin must receive WeCom messages, run them through
Harness conversations, return replies, expose only usable API tool families,
and preserve actionable `wecom-cli` failures.

## Confirmed Runtime Behavior

- `contact.users.search` can be present in `schema list` but fail with WeCom
  code `850002` when the bot lacks contact authorization.
- `chat.groups.list` can be present in `schema list` but fail with code
  `853006` when the corporation does not offer chat-history tools.
- `message.aibot.sessions.list` succeeds for the current bot and is the safe
  capability check for bot messaging.
- `schema list` therefore describes the CLI catalog, not authorization or
  corporation-specific availability.
- The CLI reports business failures both as `{ error: ... }` and as top-level
  `{ errcode, errmsg, help_message? }` objects. The transport currently handles
  only the first shape.
- QGuard's `internal/channels/wecominit.Manager` demonstrates the WeCom QR
  credential exchange: `/ai/qc/generate` returns an `scode` and authorization
  URL, then `/ai/qc/query_result` returns `bot_info.botid` and
  `bot_info.secret` after a successful scan.
- QGuard uses those returned credentials for `aibot_subscribe` over
  `wss://openws.work.weixin.qq.com`; no second manual credential form is needed.

## Design

### Unified QR authorization

The plugin will replace the opaque `wecom-cli auth init` QR ownership with an
injectable authorization manager matching the QGuard protocol:

1. Request a fresh code from `https://work.weixin.qq.com/ai/qc/generate` with a
   plugin-specific source and `plat=0`.
2. Show the returned authorization URL as the existing QR card.
3. Poll `https://work.weixin.qq.com/ai/qc/query_result` by `scode` until pending,
   success, explicit expiry/cancellation, or the local deadline.
4. On success, validate and atomically persist Bot ID and Bot Secret through the
   Harness credential service. The Secret is never returned through the Remote
   API, rendered in settings, placed in logs, or passed on a process argv.
5. Initialize the CLI encrypted profile through its manual-input mode using a
   bounded stdin/PTY channel, then start the Bot WebSocket with the same
   credentials. A partial failure reports which leg failed and does not claim a
   ready state.

Every new authorization creates a fresh QR and cancels the prior poller. Delete
authorization stops the WebSocket, removes plugin-owned credentials and CLI
authorization files, then clears dynamic tools and conversation bindings.

### Bot WebSocket channel

The plugin will use the official `@wecom/aibot-node-sdk` rather than implement
the wire protocol itself. The channel starts only after credentials are stored
and reports `connecting`, `connected`, `reconnecting`, `auth_failed`, and
`disconnected` independently from CLI API synchronization.

Inbound `aibot_msg_callback` frames are deduplicated by Bot ID plus `msgid`.
Direct messages map to a stable conversation key derived from Bot ID and sender
userid; group messages map from Bot ID and chatid. Raw identifiers remain local
binding data and are not exposed in the settings UI.

Text, voice transcription, and mixed text are converted into Harness user
messages. Image/file/video inputs are downloaded and decrypted through the SDK,
bounded by configured size and timeout, then attached to the Harness message.
Unsupported message types receive a short explicit response and do not start an
agent turn.

The bridge creates or restores the mapped Harness session, submits the inbound
message, observes assistant output, and replies through the callback's original
request context. Incremental assistant text is sent with the SDK's streaming
reply protocol, with one final completion frame. A callback deadline or reply
failure is observable and is never recorded as successfully delivered. Active
notifications remain a separate `message.aibot.send` tool.

The implementation reuses QGuard's verified lifecycle ideas—fresh QR sessions,
single-owner cancellation, credential completion, subscription/ack,
heartbeat/reconnect, normalized inbound attachments, and room bindings—but uses
Harness Agent/session APIs rather than QGuard's channel service.

### Error fidelity

The transport will recognize both CLI error envelopes. For a top-level WeCom
error it will retain `errcode` as `WeComCliError.code`. The displayed message
will be `help_message` when present, because WeCom explicitly requires that
text and its authorization URL to be shown verbatim; otherwise it will use
`errmsg`. Stderr remains diagnostic-only and is never returned as model data.

### Safe capability probes

After schema discovery and before dynamic tool installation, the host will run
only non-mutating probes for capability families that cannot be inferred from
the catalog:

- `contact`: search for a deliberately impossible sentinel keyword, preventing
  personal matches. A capability-denied response suppresses `contact.*`.
- `chat`: list groups over a valid recent, bounded time window. A
  capability-denied response suppresses `chat.*`.
- `message.aibot`: list recent bot sessions. Success enables bot session and
  bot-send tools; a capability-denied response suppresses `message.aibot.*`.

No write method is invoked during probing. Transient, malformed, timeout, or
unknown failures do not suppress tools: only known WeCom authorization or
availability errors do, so temporary network failures do not permanently hide
capabilities.

### Bot-mode messaging selection

When the bot-session probe succeeds, `message.aibot.*` remains available and
is the preferred messaging family. The generic `message.send` tool is omitted
in Bot Mode to prevent the model from selecting the wrong sender identity.
Other unrelated discovered tool families keep their existing behavior.

The plugin does not claim that it can read message bodies when `chat.*` is
unavailable. `message.aibot.sessions.list` supplies recent conversation IDs,
not message content, and the plugin cannot bypass corporation-level WeCom
restrictions.

## Lifecycle and State

Capability filtering runs during initial authorized startup and explicit schema
refresh. Each refresh computes a new complete tool generation and installs it
atomically through the existing generation installer. Deleting authorization
continues to remove every dynamic WeCom tool.

The settings card displays two independent substates under one authorization:

- API tools: unauthorized, synchronizing, ready, or sync failed.
- Bot channel: disabled, connecting, connected, reconnecting, or failed.

`enabled` is plugin-owned state and defaults to true after a successful unified
QR authorization. `connected` is set only after WebSocket subscribe ack, never
merely because the QR scan or CLI setup succeeded.

## Testing

- Transport tests cover legacy nested errors, top-level `errcode`/`errmsg`, and
  verbatim `help_message` precedence.
- Capability-filter tests cover successful probes, known denied codes,
  transient failures, sentinel contact input, bounded chat dates, and exclusion
  of generic `message.send` in Bot Mode.
- Host tests verify that only filtered definitions reach the generation
  installer and that refresh replaces the previous generation.
- QR-manager tests reproduce QGuard's generate/pending/success, incomplete
  credentials, expiry, cancellation, repeated-init, and atomic persistence
  behavior without contacting WeCom.
- Channel tests use a fake SDK boundary to cover subscribe state, reconnect,
  duplicate callbacks, DM/group session mapping, message normalization,
  attachment bounds, agent submission, streaming response, delivery failure,
  and clean disposal.
- Full plugin tests, build, package, Makefile installation, installed version,
  and real authorized startup are verified before completion.

## Acceptance Criteria

1. A missing contact grant is shown with WeCom code `850002` and the original
   authorization guidance/link rather than `wecom-cli exited with code 1`.
2. A corporation returning `853006` does not expose `chat.*` tools after
   startup or refresh.
3. A bot with working `message.aibot.sessions.list` exposes bot-session and
   bot-send tools without exposing generic `message.send`.
4. Capability refresh performs no message send or other mutating request.
5. Unknown/transient probe failures retain the catalog tools and remain
   observable instead of being treated as permanent capability denial.
6. One QR scan obtains Bot ID and Secret, provisions CLI authorization without
   placing the Secret in argv/logs/UI, and starts the Bot WebSocket.
7. A WeCom DM or group callback reaches exactly one stable Harness session and
   the assistant's response is delivered through the originating callback.
8. Settings distinguish API readiness from WebSocket connectivity and never
   expose Bot Secret.
