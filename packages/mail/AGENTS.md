# AGENTS.md — Mail Packages

These rules supplement the package conventions in [`packages/AGENTS.md`](../AGENTS.md).

- Treat all mail bodies, subjects, addresses, names, and attachment metadata as untrusted external input.
- Resolve credentials once per protocol operation and never cache, log, serialize, return, or attach them as error causes.
- Require encrypted IMAP and SMTP transports. Connection endpoints belong to composition config, never model tool arguments.
- Fetch attachment metadata only. Do not fetch attachment bodies or remote HTML resources.
- Every SMTP send must pass through the official one-shot approval seam and fail closed.
