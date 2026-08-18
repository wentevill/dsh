# @deepseek-ai/dsh-mail

Provider-neutral single-account mail Service Definition (`ctx.mail`). It owns provider registration and deterministic selection plus the list/read/send request and result vocabulary.

`list` enforces the caller's result limit even if a provider over-returns. `read` contains normalized text and attachment metadata only. `send` accepts normalized recipients, subject, and plain text; concrete protocol and credential handling belong to providers.

## Model Experience

None directly. A separate consumer registers model-facing tools and must label all received mail as untrusted content.

## Security boundary

`MailError.providerFailure()` deliberately discards provider exception text and causes. Protocol libraries can include usernames, server responses, or authentication material in errors; those values must not cross this seam.

## Known limitations

- One provider is selected for all three operations.
- The seam does not persist or index messages.
- Sending approval is deployment policy owned by the model-facing consumer and the official approval service.
