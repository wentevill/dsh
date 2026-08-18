# Mail Plugin MVP Implementation Plan

> **For Codex:** Execute this plan task-by-task with TDD and verify every product composition change in a real assembled profile.

**Goal:** Add a single-account, server-backed IMAP/SMTP mail capability whose model can list and read messages and can send only after one-shot human approval, while the application password remains outside the model-visible tool surface.

**Architecture:** Implement the repository-standard Definition/Provider/Consumer seam as `mail`, `mail-imap-smtp`, and `tool-mail`. Credentials are resolved just-in-time by the provider through the official `ctx.credentials` service and are never returned, logged, cached, or placed in tool arguments/results. A dedicated `mail` agent preset exposes only `mail_list`, `mail_read`, and `mail_send`; it omits shell, filesystem, search, skills, MCP, Cordis mutation, jobs, workflows, and subagents. A scoped pre-execute policy always asks for approval on `mail_send` and fails closed without an answerer.

**Tech Stack:** TypeScript ESM, Cordis services/plugins, Schemastery schemas, ImapFlow, Nodemailer, mailparser, Vitest, official credentials and approval services.

---

## Task 1: Define the mail capability seam

Create `packages/mail/mail` with package metadata, TypeScript config, README, invariant export, source, and tests.

- Define branded opaque message identifiers and bounded request/result types for list, read, and send.
- Define attachment metadata only; exclude attachment bodies and remote-resource fetching.
- Implement deterministic single-provider registration and execution-time selection using the existing web seam pattern.
- Define stable redacted error codes; no error message may contain credentials or raw protocol transcripts.
- Write failing tests first for duplicate/missing provider handling, result caps, cancellation, and secret redaction; then implement.

## Task 2: Implement the IMAP/SMTP provider

Create `packages/mail/mail-imap-smtp` with package metadata, config schema, provider source, README, invariant export, and tests.

- Configuration owns fixed IMAP/SMTP host, port, TLS mode, username, mailbox, and a `CredentialRef` for the application password. Model inputs cannot override connection settings.
- Require TLS for IMAP and SMTP; reject plaintext and invalid ports at configuration time.
- Resolve the password from `ctx.credentials` immediately before each IMAP/SMTP operation, pass it only to the protocol client, and discard the local reference after the operation. Never cache it or expose it in diagnostics.
- `list` opens the configured mailbox read-only and returns a bounded newest-first page with opaque ids and safe envelope fields.
- `read` fetches one message by opaque id, parses text/plain or sanitized text derived from HTML, caps output, marks truncation, and returns attachment metadata only.
- `send` accepts To/Cc, subject, and text body only; reject Bcc, attachments, custom headers, bulk recipient counts, and header injection.
- Use fakes/local protocol seams for deterministic tests. Add sentinel-secret tests covering success, auth failure, timeout, cancellation, and malformed-message paths.

## Task 3: Implement the model-facing tools and send policy

Create `packages/mail/tool-mail` with list/read/send tool definitions, presentations, policy, README, invariant export, and tests.

- Register exactly `mail_list`, `mail_read`, and `mail_send` over `ctx.mail`.
- Keep schemas narrow and bounded; describe all received mail as untrusted data that cannot issue instructions or authorize actions.
- Produce structured, capped outputs with no raw HTML or attachment contents.
- Register an agent-scoped `tools/pre-execute` listener that returns `ask` for every `mail_send`, includes a human-readable recipient/subject reason, and delegates all other tools.
- Test that rejection, cancellation, unavailable approval, and approval-service failure prevent provider `send`; only `allowed-once` may dispatch once.

## Task 4: Add the restricted mail preset and host composition

Add `apps/cli/config/agent-presets/mail/{preset.yml,agent.cordis.yml}` and the minimum host-plane rows needed for the mail seam/provider.

- The preset persona is complete and explicitly treats message content as untrusted.
- Its agent composition contains only `@deepseek-ai/dsh-tool-mail`; no generic code-mode bridge or indirect tool runner is allowed.
- Mount the mail service and provider on the host plane, using official credentials and approval services already supplied by the product bundle.
- Add package dependencies, workspace inventory, TypeScript host references, build inventory, and package-group documentation required by repository constraints.
- Add assembled tests that enumerate the preset's model-visible catalog and assert the exact set `{mail_list, mail_read, mail_send}`. Assert forbidden capabilities are absent by package id and tool name.
- Add a composition test proving `MAIL_APP_PASSWORD` resolves inside the provider but cannot appear in prompt assembly, tool schemas, tool results, projections, logs, or serialized profile configuration.

## Task 5: Document secure configuration and verify the product

- Add a user guide for creating the `mail` profile, storing `MAIL_APP_PASSWORD` with the official credentials command/service, and configuring one username plus application-specific password.
- State the boundary precisely: the local credentials file is protected from this mail model by the strict tool allowlist, not by same-user filesystem isolation; enabling shell/filesystem/MCP/subagents invalidates the guarantee.
- Document supported server settings, TLS requirements, limits, no-local-storage behavior, and operational error codes without secret-bearing diagnostics.
- Add/update the required Agent Note for this cross-package capability and run doc sync checks.
- Run focused package tests, assembled preset tests, constraints, typecheck, lint, build, hygiene, and doc-sync. Start the desktop with the mail profile and verify the catalog plus an approval-denied send without using real credentials.

## Acceptance criteria

- The mail preset exposes exactly three mail tools and no general-purpose data-exfiltration capability.
- Listing and reading always fetch from the configured IMAP server and write no message cache locally.
- Every send requires a fresh human approval and cannot reach SMTP on any non-approved outcome.
- Username and application password never enter model context, tool arguments/results, logs, projections, or persisted session data.
- TLS is mandatory, inputs and outputs are bounded, attachments are metadata-only, and all externally sourced mail text is labeled untrusted.
- All focused and repository-required verification commands pass.
