# Mail Plugin Packaged Defaults Design

## Goal

Ship one repository-owned set of non-secret mail defaults in every production `dsh-mail` archive and apply those defaults immediately on first installation. An upgrade, reinstall, or later package version must preserve settings already owned by the user's profile.

## Default Configuration Ownership

`plugins/mail/cordis.patch.yml` is the canonical packaged default configuration. It remains version controlled beside the plugin and contains the `dsh-mail` bundle insertion plus the initial `config` object. The package manifest continues to declare it through `dsh.bundle.patch`, and the release archive continues to include it through `files`.

The patch may contain only non-secret settings such as mailbox names, endpoint hosts and ports, TLS flags, and the credential reference name. It must never contain an account password, credential value, token, or other secret. `passwordEnv` remains a reference to key management rather than a credential.

The Schemastery defaults in `MailSettingsSchema` remain field-level parsing and UI fallbacks. They do not replace the packaged installation defaults. Values duplicated between the schema and bundle patch must remain compatible so that the installed profile can be parsed and rendered on its first boot.

## Packaging and Installation Flow

The existing release flow copies the mail package into an isolated staging tree, builds it, deploys its production dependency closure, and packs the result. No command-line parameters or generated defaults file are introduced. The release audit verifies that the archive contains the declared bundle patch.

Installation continues to delegate to the upstream command:

```text
dsh plugin --profile <profile> add <mail-archive>
```

The DSH plugin installer resolves `dsh.bundle.patch` from the installed package and reconciles its bundle insertion into the target profile. On a fresh profile, the inserted mail layer carries the repository defaults and they are available when the host and settings card first load. There is no startup repair step and no post-install settings writer.

## Preservation Semantics

Packaged defaults are seed values, not managed policy. They initialize a mail configuration only when the profile does not already own one. Once a user has saved mail settings, those values take precedence over defaults shipped by the same or a later archive.

An upgrade or reinstall must not replace an existing mail configuration wholesale and must not reset individual user-controlled fields. If the upstream bundle reconciliation already provides this insert-only behavior, the mail package relies on it and locks the behavior down with an end-to-end test. If verification shows that reconciliation overwrites existing configuration, the implementation must add the narrowest installation-time first-install guard available without creating a second settings store or changing the archive format.

Removing and reinstalling the package does not imply consent to erase profile settings. Explicit reset remains a separate user action through the settings surface.

## Failure Behavior

Packing fails if the bundle patch is missing from the production archive, is not the file declared by `dsh.bundle.patch`, or does not contain a valid mail insertion. Installation failures continue to surface through the upstream `dsh plugin add` exit status.

Defaults must satisfy the mail schema and TLS invariant. Invalid endpoint defaults must be caught by package-level checks before release rather than deferred to first startup. No test or diagnostic may print credential values.

## Verification

Package tests verify that:

- `package.json` declares `dsh.bundle.patch` as `./cordis.patch.yml`;
- the production archive contains `package/cordis.patch.yml`;
- the patch provides a complete schema-compatible, TLS-only initial mail configuration;
- the patch contains a credential reference but no credential value.

The packaged Desktop installation test uses a fresh temporary Harness home and the staged runtime to verify the full lifecycle:

1. Install the mail archive once.
2. Boot the profile immediately and load mail settings through the real remote boundary.
3. Assert that the repository defaults are present without a repair or manual save.
4. Save a distinct non-secret user configuration through the settings boundary.
5. Exercise the supported package upgrade or remove-and-reinstall path.
6. Boot and load settings again, asserting that every saved user value remains unchanged.

The test continues to avoid real network connections and real credentials.

## Out of Scope

This change does not add per-build CLI flags, environment-variable substitution, organization policy enforcement, secret provisioning, or a new defaults file. It does not change the settings UI's explicit reset behavior or generalize the mechanism to other plugins.
