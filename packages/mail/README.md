# mail/ — mail capability family

This family provides a provider-neutral, single-account mail seam. The MVP reads directly from IMAP and sends through SMTP without persisting message content locally.

| Package | Role | ctx key |
|---|---|---|
| [`mail/`](mail/README.md) | Defines mail provider registration, selection, bounded results, and redacted errors | `ctx.mail` |

Providers and model-facing tools are added as separate packages so credentials remain a host-plane concern and tool schemas never carry secret values.
