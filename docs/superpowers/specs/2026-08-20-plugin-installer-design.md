# Plugin Installer Design

## Goal

Add a production DSH plugin that installs other DSH plugins by accepting a dragged or selected `.tgz` package. Its card appears after the existing cards in **Settings → Plugins → Plugin list**. Every package is inspected before installation, an existing plugin requires explicit confirmation, and a successful operation tells the user to restart the application manually.

The installer reuses the Desktop application's private Node, upstream `dsh` CLI, and pnpm runtime. It does not implement a second package manager, edit a profile manifest directly, invoke host-installed tooling, or modify the immutable `upstream` checkout.

## Package Manifest Contract

Every installable plugin archive contains one YAML manifest at `package/dsh.plugin.yml`. The root `package/package.json` points to it and continues to own npm and DSH bundle mechanics:

```json
{
  "dsh": {
    "plugin": {
      "manifest": "./dsh.plugin.yml"
    },
    "bundle": {
      "patch": "./cordis.patch.yml"
    }
  }
}
```

The YAML manifest is the user-facing plugin identity and publishing record:

```yaml
schemaVersion: 1
id: wecom
name: 企业微信 AI
package: dsh-wecom
version: 0.2.3
description: 企业微信 AI 插件
publisher:
  name: DeepSeek Harness
  url: https://example.com
homepage: https://example.com
repository: https://github.com/example/dsh-wecom
license: MIT
```

All shown fields are required. `schemaVersion` must equal `1`; `id` is a stable, normalized plugin identifier; and `package`, `version`, `name`, publisher name, description, and license must be non-empty and valid for their roles. The manifest's `package` and `version` must exactly equal `package.json`'s `name` and `version`. The referenced manifest, bundle patch, package entry, and declared client entry must exist inside the archive. Manifest and referenced paths must be normalized relative paths that stay inside the package root.

The mail, WeCom, and installer release packages adopt this manifest and include it in their published `files`. Their package tests verify that the archive contains a valid manifest and that its duplicated npm identity fields agree with `package.json`.

## Architecture

The new private package `plugins/installer` is published as `dsh-plugin-installer` and has three bounded components:

1. **Client card.** A browser plugin registers a card in `settings.plugin.item`. The Desktop Web composition loads its contribution after the other plugin cards so registration order places it last in the configurable Plugin list. It supports drag-and-drop and an accessible file picker for one `.tgz` file.
2. **Installer Remote.** A Host Remote owns upload sessions, archive validation, installed-package inspection, preview generation, confirmation, and cleanup. It accepts bytes and opaque session tokens, never a server-side path or command argument from the browser.
3. **CLI adapter.** A narrow Host adapter invokes the currently running Desktop distribution's private Node and upstream `dsh` entry with the private pnpm path. The fixed logical operation is `dsh plugin --profile web add <validated-temporary-archive>`.

The Host registers an empty `pluginInstaller` settings namespace as the existing configurable list's visibility declaration. This avoids modifying the generic upstream Plugin list. The namespace carries no user preferences and the card does not use it for installation state.

## Interaction and Data Flow

The card has four states:

- **Idle:** a drop zone and “Choose `.tgz` file” action.
- **Validating:** chunk upload and inspection progress, with cancel support.
- **Awaiting confirmation:** the complete YAML manifest and intended action.
- **Result:** a success message instructing a manual application restart, or a safe error with retry.

The browser accepts exactly one `.tgz`, rejects files larger than 100 MiB, and uploads sequential 1 MiB chunks. The Host creates an unguessable upload ID and a private temporary file, permits only the next expected chunk, and enforces the limit independently of the browser. Cancellation, validation failure, CLI failure, timeout, Remote disposal, and successful completion remove temporary state and files.

After upload, the Host inspects the archive without executing package code. It returns a preview containing display name, stable plugin ID, npm package name, current and candidate versions, publisher and publisher URL, description, homepage, repository, license, target profile, and intended action.

The action is one of first install, upgrade, downgrade, or same-version reinstall. For an installed package, the preview compares the installed and candidate manifests field by field. Publisher changes, downgrades, and same-version reinstalls receive warning presentation. First installation still requires an Install click. Every existing-package action requires an explicit second confirmation with action-specific wording.

The preview response includes a digest of the validated archive and a single-use confirmation token bound to the upload session, digest, target package, installed-state snapshot, and action. Confirmation fails if the upload expired, was replaced, was already consumed, or if installed state changed since preview. The CLI adapter receives only the Host-owned temporary path after this check.

On CLI exit zero, the Host reports installation completion and the Client displays “Installation complete. Restart the application manually to load the plugin.” The running profile is not hot-reloaded and the Desktop application is not restarted automatically.

## Archive and Execution Security

The installer Remote is available only through the existing loopback-trusted Web surface. It fixes the target profile to `web`. The browser cannot choose a profile, executable, working directory, package name, command verb, environment, or server path.

Archive inspection rejects:

- invalid gzip or tar data;
- absolute paths, `..` traversal, non-normalized paths, or files outside `package/`;
- symbolic links, hard links, devices, FIFOs, and other special entries;
- duplicate `package.json`, `dsh.plugin.yml`, or referenced critical files;
- excessive entry count, per-entry size, total expanded size, or compression ratio;
- malformed YAML, YAML aliases or custom tags, unknown manifest keys, or unsupported schema versions;
- missing or inconsistent npm and DSH plugin metadata;
- local/workspace dependency specifications and a bundle that is not a prebuilt publishable package.

The installation command disables dependency lifecycle scripts. A dragged archive is treated as untrusted data during inspection and installation. The plugin's code becomes trusted application code only after the user has reviewed the manifest, confirmed the action, restarted the application, and the normal DSH composition loads it.

The adapter derives the current packaged CLI and private package-manager path from verified Desktop runtime facts. It never searches for host `node`, `npm`, `pnpm`, or `dsh`, never mutates the parent PATH, and never installs globally. Child stdout and stderr are captured with strict bounds. User-facing errors expose stable codes and a short sanitized summary, not absolute paths, environment values, or unrestricted command output.

## Failure Semantics

Stable error categories cover unsupported file type, upload size, chunk ordering, expired upload, invalid gzip/tar, unsafe archive entry, invalid YAML, manifest mismatch, missing bundle artifact, unsupported package dependency, changed installed state, consumed confirmation, and CLI installation failure.

Validation failure never calls the CLI. Confirmation failure never installs an unreviewed archive. A nonzero CLI exit is reported as failure and relies on upstream `dsh plugin` and pnpm semantics for profile reconciliation; the installer does not attempt an independent profile rollback or startup repair. The card remains usable after a failure and requires the user to select or drop a package again if its upload session was consumed or cleaned up.

## Verification

Automated coverage includes:

- YAML schema parsing, unknown-key rejection, URL and identifier validation, and cross-checking against `package.json`;
- tar traversal, links, special entries, duplicate critical entries, compression bombs, entry limits, expanded-size limits, and missing referenced artifacts;
- sequential chunks, duplicate or skipped chunks, Host-side size enforcement, cancellation, expiry, disposal, and temporary-file cleanup;
- first install, upgrade, downgrade, same-version reinstall, publisher change, installed-state race, digest binding, single-use confirmation, and rejected confirmation;
- Client drag/drop, file picker and keyboard accessibility, progress, cancellation, manifest rendering, field differences, warnings, confirmations, and success/failure states;
- a release-shaped `.tgz → private dsh plugin add → web profile dependency and bundle reconciliation` end-to-end test using an empty temporary Harness home;
- archive tests proving mail, WeCom, and installer packages ship matching `dsh.plugin.yml` manifests;
- an upstream-cleanliness check proving the pinned public checkout remains unchanged.

## Deferred Scope

Registry browsing, URL installation, uninstall, bulk installation, drag of source directories, remote-host administration, signature infrastructure, automatic restart, and hot reload are outside this feature. A future signature policy can extend the versioned YAML schema and confirmation preview without changing the upload or CLI ownership boundaries.
