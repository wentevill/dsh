# Official Remote Settings Implementation Plan

## Goal

Persist the mail configuration from the Web UI without changing DSH, using only the documented Typert Remote and Host SettingsScope extension surfaces.

## Design

- Restore the mail package's TypeScript sources as the source of truth for its existing published artifacts.
- Add a `MailSettingsRemote` Host service whose strictly bounded `save` method writes through the mail-owned Host SettingsScope.
- Generate and publish `./typert` and `./remote` artifacts with the official Typert generator.
- Mount the generated contribution from the mail Client plugin and replace direct `settings.mutate('mail')` calls with the mail Remote method.
- Keep credentials on the existing credentials API and keep TLS-only validation.

## Verification

- A failing Client controller test proves the settings allowlist currently rejects direct saves.
- Host tests prove the Remote method validates and persists only the mail section.
- Package tests prove the tgz contains the strict Typert artifacts and no source tree.
- A fresh-profile Desktop test installs the tgz once and boots the Web profile.
