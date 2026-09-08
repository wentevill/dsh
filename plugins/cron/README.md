# DSH Cron

`dsh-cron` provides persistent, Workspace-bound Cron tasks for the global
lifetime of a running DeepSeek Harness process. It is an independent plugin and
does not modify or fork DeepSeek Harness.

## Behavior

- Expressions use standard five-field Cron syntax: minute, hour, day of month,
  month, and day of week. Seconds, macros, and extended fields are rejected.
- Every task stores an explicit IANA timezone. The conversation manager starts
  new forms with the browser timezone; the Host never guesses its own timezone.
- A task either queues each execution into the Session that created it, or
  creates a separate Session for every execution using the captured Agent
  preset. New Sessions are pinned to the `workspace-write` permission preset,
  which keeps approval in `ask` mode.
- Tasks are permanently bound to their creation Workspace. Workspace, target
  Session, and Agent preset ownership are always derived by the Host.
- Model-driven create, update, delete, and resume actions ask for confirmation.
  Pause and queries do not. Buttons in the expanded conversation manager are
  explicit user gestures and call the same Host command path directly.
- Pause stops future triggers but does not cancel an active Session run. Delete
  is terminal and also leaves an already active run alone.
- After Harness downtime, an overdue active task produces at most one delayed
  catch-up execution. Missed intervals are not replayed as a backlog.
- Version 0.1 keeps execution history without a retention limit. History is
  read through bounded cursor pages.

This plugin has no offline or detached execution mode. Cron tasks run only
while the Harness Host process is running.

## Development

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm run build
```

Released under the MIT License.
