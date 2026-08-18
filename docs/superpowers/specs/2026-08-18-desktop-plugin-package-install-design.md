# Desktop Plugin Package Installation Design

## Goal

Make a production plugin install complete in one `dsh plugin` invocation from a published package. The first acceptance package is `dsh-mail-plugin-0.1.0.tgz`. After installation, the Desktop web profile must start immediately without manual dependency installation, profile edits, repair commands, or host tooling.

## Production Boundary

Production installation accepts a registry package specification, package URL, or complete package archive such as `.tgz`. A source directory and pnpm `link:` dependency are development mechanisms and are outside this acceptance path.

The published mail package must contain its manifest, compiled host entry, bundle patch, client artifact where declared, license, and other runtime files named by its package manifest. The manifest declares plugin-owned third-party runtime libraries as `dependencies`. DSH and Cordis capabilities supplied by the product remain `peerDependencies`, so an installed plugin uses the Desktop runtime's single service and Cordis instances.

The installer may access npm to resolve ordinary dependencies. A package is invalid when its declared entry, bundle patch, or required manifest metadata is missing.

## Private Desktop Toolchain

The macOS application owns its complete execution and installation toolchain:

- the pinned Node runtime;
- the `dsh` CLI package and executable entry;
- a pinned package-manager runtime used by `dsh plugin`.

These are private resources inside `DeepSeek Harness.app`. Installation must invoke them by resource paths derived from the running application bundle. It must not inspect or invoke a host `node`, `npm`, `pnpm`, or `dsh`, modify the host PATH, perform a global installation, or require the user to know that the internal `dsh` binary exists.

The CLI remains the single owner of plugin-management semantics. A Desktop-facing install action must call the bundled CLI rather than implement a second package installer.

## Installation Flow

One user action maps to one logical command:

```text
dsh plugin --profile web add <published-package-spec>
```

The bundled upstream `dsh` initializes the profile when necessary, invokes `pnpm` in that profile, and waits for package and dependency installation to finish. It then resolves the installed package by its real package name and reconciles packages declaring `dsh.bundle.patch` into the bundle layer list.

The Desktop runtime does not replace, proxy, patch, or reimplement this CLI. Tauri starts the upstream CLI with a process-local PATH whose first entries are the bundled Node directory and the bundled runtime's `node_modules/.bin` directory. Consequently the unmodified CLI's `pnpm` lookup resolves to the private packaged pnpm shim, and that shim's `node` lookup resolves to the private packaged Node executable. The host PATH may remain after these private entries for unrelated operating-system utilities, but no host Node, npm, pnpm, or dsh may satisfy either lookup. No global or persistent PATH modification is made.

The package manager may create its normal lockfile and module layout inside the application-owned Harness data directory. It must not install runtimes or packages globally.

## Failure Semantics

The packaging layer preserves the upstream CLI's package-management semantics. A package-manager failure returns a nonzero result and the upstream CLI does not reconcile a failed package into `dsh.profile.bundles`. The Desktop layer does not introduce a second installer or transactional profile implementation.

No startup-time repair is allowed. Profile boot only loads the installed state and reports corruption; it does not fetch dependencies or mutate the installation.

## Mail Package Correction

The mail package is rebuilt as a complete publishable archive. Its compiled output must import only:

- dependencies declared in the archive manifest and installed by the one command; or
- DSH/Cordis peers guaranteed by the Desktop runtime closure.

The current failure is covered explicitly: installation must provide `@deepseek-ai/schemastery` before the mail entry is loaded. The same check applies to `imapflow`, `mailparser`, and `nodemailer`. The archive's patch and configuration schema must agree, so the first boot cannot fail because the archive contains stale configuration syntax.

## Verification

Automated acceptance uses an empty temporary Harness home and the packaged Desktop runtime, not workspace Node resolution:

1. Assert the runtime contains Node, the DSH CLI, and the pinned package manager.
2. Start the bundled upstream `dsh` with a hostile or empty inherited PATH and the same process-local private PATH construction used by Tauri.
3. Run one `dsh plugin --profile web add <mail.tgz>` command.
4. Assert the profile contains one mail dependency and one mail bundle layer, with no `link:` source path.
5. Resolve every mail runtime import from the installed profile and Desktop fallback.
6. Boot the composed profile immediately and prove the mail row activates. A deterministic probe substitutes network-facing behavior; no real mailbox credentials are needed.
7. Audit the built `.app` and DMG so release packaging cannot omit Node, upstream dsh, pnpm, or its private executable shim.

The manual acceptance flow is the same one-command install followed by a normal Desktop launch. Running a host package manager, adding a missing dependency, editing `package.json`, or invoking a repair command invalidates the result.

## Deferred Scope

A graphical package picker and registry browser are not required for this fix. Their future backend must delegate to the same bundled `dsh plugin` path. Source-directory live linking remains a development-only concern and is not changed by this production-package design.

## Immutable Upstream Constraint

The public source checkout referenced by `upstream` remains byte-for-byte clean at its pinned revision. In particular, this work does not modify `apps/cli`, add an environment-variable contract to dsh, or create a Desktop-specific dsh wrapper. Packaging-owned changes are limited to Desktop runtime assembly, Tauri child-process environment construction, release audits and tests, and the private publishable mail plugin package.

This section supersedes any earlier implementation-plan steps that proposed changing upstream CLI source or implementing profile transactions in that source. A replacement implementation plan must be written before code changes begin.
