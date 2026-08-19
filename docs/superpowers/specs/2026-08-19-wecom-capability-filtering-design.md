# WeCom Capability Filtering and Error Fidelity

## Goal

Make the WeCom plugin expose only messaging/contact tool families that the
currently authorized bot and corporation can actually use, and preserve the
actionable error returned by `wecom-cli` when a call fails.

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

## Design

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

## Testing

- Transport tests cover legacy nested errors, top-level `errcode`/`errmsg`, and
  verbatim `help_message` precedence.
- Capability-filter tests cover successful probes, known denied codes,
  transient failures, sentinel contact input, bounded chat dates, and exclusion
  of generic `message.send` in Bot Mode.
- Host tests verify that only filtered definitions reach the generation
  installer and that refresh replaces the previous generation.
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
