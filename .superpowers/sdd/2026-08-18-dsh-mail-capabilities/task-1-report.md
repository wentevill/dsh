# Task 1 report — Mail identity and settings contract

## Status

Implemented the `dsh-mail` 0.2.0 identity and the Mail settings capability contract.

## Implementation

- Renamed the package, Host/client plugin names, Cordis bundle entry, generated Typert identity, client bundle ID, Makefile archive, packaging assertions, and Desktop install E2E expectations from `dsh-mail-plugin` to `dsh-mail`.
- Added `archiveMailbox` (default `Archive`) and `allowDelete` (default `false`) to `MailSettings`, Host `Config`, resolved bootstrap config, Host settings registration, Remote-generated schemas, Cordis defaults, the client controller, and the settings card with English and Chinese copy.
- Added `MailCapabilities` and `mailCapabilities(settings)`, deriving IMAP and SMTP separately from trimmed endpoint hosts and deletion from IMAP plus `allowDelete`.
- Kept the existing `MailSettingsRemote` load/save and parent/child `mail`/`mail-client` lifecycle intact.
- Rebuilt committed generated Mail artifacts. The build-support generator, client bundle configuration, CSS marker, and Makefile packaging test were adjusted because the identity rename otherwise leaves generated/runtime references to the old package name.

## Tests and RED/GREEN evidence

- RED: `corepack pnpm exec vitest run plugins/mail/tests/package.spec.ts plugins/mail/tests/settings-capabilities.spec.ts` failed as expected before implementation: package name and archive identity were old, schema fields were absent, and `mailCapabilities` did not exist.
- GREEN build: `npm --prefix plugins/mail run build` exited 0.
- GREEN focused: `corepack pnpm exec vitest run plugins/mail/tests/package.spec.ts plugins/mail/tests/settings-capabilities.spec.ts plugins/mail/tests/settings-save.spec.ts` — 3 files, 8 tests passed.
- GREEN full relevant Mail suite: `corepack pnpm exec vitest run plugins/mail/tests` — 7 files, 14 tests passed.
- Related packaging verification: `corepack pnpm exec vitest run packaging/makefile.spec.ts` — 1 file, 4 tests passed.

## Files

- Required task files plus generated `plugins/mail/lib/*` artifacts were changed.
- Supporting identity files changed: `plugins/mail/scripts/generate-typert.mjs`, `plugins/mail/tsdown.config.ts`, `plugins/mail/src/client/card-css.ts`, and `packaging/makefile.spec.ts`.

## Self-review

- Confirmed `dsh-mail-plugin` has no remaining runtime/build/package-path references in the modified Mail, Make, Desktop E2E, or packaging test scope.
- Confirmed both Cordis example endpoint hosts are exactly empty strings, while default ports and secure booleans remain unchanged.
- Confirmed controller save sends the complete settings section, including both new fields, and generated Remote schemas include them.
- Ran `git diff --check`; no whitespace errors.

## Concerns

- No implementation blockers. The Mail build emits existing tsdown deprecation recommendations (`external`/`noExternal`); it still exits successfully.
- Project-knowledge validation reported stale evidence for pre-existing relationships whose generated/Make/package files changed; no conflicting implementation path was found or used.

## Fix Round 1

### Implementation

- Treated a trimmed empty IMAP or SMTP host as an intentionally disabled endpoint. The shared endpoint assertion runs at bootstrap, before settings persist, and before settings become effective; configured endpoints require implicit TLS and an integer port from 1 through 65535.
- Replaced the coupled "all settings must be configured" fallback with `resolveEffectiveConfig`, so a served Mail settings section preserves IMAP-only and SMTP-only configurations independently.
- Added `MailCardStatus` to `MailCardState`, derived its receive, send, and permanent-delete booleans from `mailCapabilities`, and rendered those values with English and Chinese status labels.
- Regenerated `plugins/mail/lib/client.js` after the interrupted clean step had deleted it; updated the generated-bundle test loaders for its Cordis service external.
- Updated the plugin README install example to `dsh-mail-0.2.0.tgz`.

### Tests and outputs

- RED: `corepack pnpm exec vitest run plugins/mail/tests/settings-save.spec.ts` — 1 file, 1 expected assertion failure: `status` was `undefined`; the other 3 tests passed. The first run also exposed the regenerated client bundle's missing Cordis test-loader stub, which was corrected before the status assertion was re-run.
- RED: `corepack pnpm exec vitest run plugins/mail/tests/host-config.spec.ts` — 1 file, 1 expected assertion failure because settings-backed insecure IMAP did not throw; the other 3 tests passed.
- RED: `corepack pnpm exec vitest run plugins/mail/tests/host-settings-remote.spec.ts` — 1 file, 1 expected assertion failure because an insecure SMTP save resolved; the other 2 tests passed.
- GREEN build: `npm --prefix plugins/mail run build` — exit 0; emitted `plugins/mail/lib/client.js` (205.99 kB) and the Host/type artifacts. tsdown printed its existing `external`/`noExternal` deprecation recommendations.
- GREEN focused: `corepack pnpm exec vitest run plugins/mail/tests/settings-save.spec.ts plugins/mail/tests/host-config.spec.ts plugins/mail/tests/host-settings-remote.spec.ts plugins/mail/tests/card-status-render.spec.ts plugins/mail/tests/settings-capabilities.spec.ts` — 5 files, 15 tests passed.
- GREEN full Mail suite: `corepack pnpm exec vitest run plugins/mail/tests` — 9 files, 22 tests passed.
- Hygiene: `git diff --check` — exit 0 with no whitespace errors.

### Self-review

- Confirmed `assertConfiguredEndpoint` validates TLS and port only after a non-empty host, so the shipped empty-host defaults boot while unsafe configured bootstrap, saved, and effective settings fail.
- Confirmed `resolveEffectiveConfig` validates then copies the complete settings section, including deliberately empty peer endpoints, preventing IMAP and SMTP from being coupled through bootstrap fallback.
- Confirmed the card renders semantic `status.receive`, `status.send`, and `status.permanentDelete`; the generated-card rendering test verifies both English and Chinese output.
- Confirmed the generated client artifact exists and the full Mail suite loads it successfully.
- A post-fix review found no remaining Critical, Important, or Minor issues.

### Concerns

- Project-knowledge validation still reports stale pre-existing evidence for unrelated Make/package/generated-artifact relations. The reconciled Mail-capability relations validate the changed Host/controller/card path; no conflict or implementation blocker was found.
