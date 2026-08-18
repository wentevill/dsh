# Mail Plugin Design

## Goal

Add one native, single-account mail capability that reads current server state through IMAP and sends messages through SMTP without exposing the application password to the model.

## Architecture

The capability uses the repository's Service Definition, Service Provider, and Consumer roles. The mail Service Definition exposes protocol-independent operations. The IMAP/SMTP Provider injects `ctx.credentials`, resolves the configured `CredentialRef` once per operation, and owns all network clients. The model-facing tool Consumer injects only the mail service and therefore cannot resolve credential values.

One plugin instance configures one account. Multiple accounts require separately mounted instances. The MVP supports a username and application-specific password; it does not support OAuth.

## Configuration and Credential Isolation

Configuration contains an account label, username, IMAP and SMTP hosts and ports, TLS mode, default mailbox, operation limits, and a `CredentialRef`. It never contains the application password. The recommended reference is `MAIL_APP_PASSWORD`, which matches the official subprocess credential scrub.

The Provider resolves the credential only inside each IMAP or SMTP operation and never caches it. Tool schemas, arguments, values, rendered content, presentation metadata, diagnostics, logs, and session events never include the credential value. Authentication failures map to a stable redacted error category. The implementation stops if repository verification cannot prove that the configured credential source and filesystem policy keep the value unavailable to model-controlled shell and file tools.

Only certificate-validated TLS connections are accepted. Tool arguments cannot override account identity, server addresses, ports, TLS, or the credential reference.

## Tools

`mail_list` accepts an optional mailbox, a bounded page size, and a pagination cursor. It returns message UID, date, sender, recipients, subject, size, flags, and the next cursor without fetching complete bodies.

`mail_read` accepts a mailbox and UID. It returns bounded headers, plain text, an optional bounded HTML representation, attachment metadata, and an explicit truncation flag. It does not download attachments, load remote resources, execute HTML, or follow links.

`mail_send` accepts recipients, optional carbon-copy recipients, subject, plain text, and optional HTML. It cannot change the configured sender or add arbitrary headers. Official tool execution policy must approve the call before the Provider establishes an SMTP connection. The result contains the server message id and accepted or rejected addresses.

The MVP excludes attachments, blind carbon copies, delivery receipts, bulk sending, deletion, movement, flag mutation, background polling, and local mail persistence.

## Untrusted Content and Failures

Mail content is untrusted external data and never becomes an instruction or triggers another tool automatically. Body limits and pagination prevent an unbounded mailbox from entering model context.

Failures use stable categories: `authentication_failed`, `connection_failed`, `tls_failed`, `mailbox_not_found`, `message_not_found`, `message_too_large`, `send_rejected`, and `cancelled`. Network operations honor the caller's cancellation signal, and plugin disposal closes live connections.

## Verification

Unit tests use local IMAP and SMTP doubles with a unique sentinel password. Tests scan tool values, errors, rendered content, presentation metadata, logs, and session records and fail if the sentinel appears. They verify dependency isolation, fixed server configuration, mandatory TLS, pagination, UID reads, truncation, untrusted HTML handling, cancellation, redacted errors, and approval before SMTP connection.

An assembled keyless snapshot covers model-visible tool descriptions and results. Optional real-account tests require explicit credentials, skip by default, and must use a dedicated test account.
