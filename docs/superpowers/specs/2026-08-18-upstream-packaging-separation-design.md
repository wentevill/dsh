# Upstream Source and Desktop Packaging Separation Design

## Goal

Separate the private macOS Desktop distribution from the public DeepSeek Harness GitHub checkout. The upstream checkout must remain byte-for-byte attributable to GitHub and receive no Desktop, mail, installer, generated, lockfile, or documentation changes from this project.

## Directory Ownership

The existing outer directory becomes the writable packaging repository:

```text
deepseek-harness/
├── .git/                         private packaging history
├── upstream -> deepseek-harness-source
├── deepseek-harness-source/      GitHub checkout; upstream-owned and read-only by policy
├── apps/desktop/                 Tauri shell, runtime staging, audits, DMG builder
├── packages/mail/                packaging-owned mail capability packages
├── plugins/mail/                 complete published mail package and archive
├── packaging/                    private dsh launcher/install integration
├── docs/                         packaging designs, plans, and operations
└── package.json                  packaging-only scripts and dependencies
```

`upstream` is the only stable path packaging code uses to refer to the GitHub checkout. Build scripts resolve the symlink but never write through it.

The directory `deepseek-harness-source` retains its own `.git` directory and `origin` remote. Its `master` branch tracks `origin/master`. It is not a submodule of the packaging repository because the local checkout already exists and the packaging build should select an explicitly verified upstream revision without nesting Git ownership.

## Migration of Existing Work

The current inner checkout contains 16 local commits above `origin/master`. Before changing it, create a permanent local backup branch named `archive/desktop-packaging-20260818` at the current commit `2c4cf69b2f`.

Extract packaging-owned files from that archive into the outer repository:

- `apps/desktop/**` becomes outer `apps/desktop/**`;
- `packages/mail/**` becomes outer `packages/mail/**`;
- Desktop and mail design/plan documents become outer `docs/**`;
- packaging-specific Makefile targets are translated into the outer package scripts rather than copied into upstream;
- upstream-wide manifest, TypeScript, and lockfile edits are not copied verbatim. The outer repository supplies its own workspace and build configuration.

After extraction is verified, reset only the inner checkout's `master` branch and working tree to `origin/master`, then rename the directory from `deepseek-harness` to `deepseek-harness-source` and create `upstream -> deepseek-harness-source`.

The archive branch preserves every prior commit and remains recoverable from the inner Git repository. No force push or remote branch mutation is performed.

## Read-only Upstream Contract

Packaging commands perform a preflight check before staging or building:

1. `upstream` must be a symlink whose resolved directory is a Git repository.
2. `git -C upstream status --porcelain` must be empty.
3. `git -C upstream rev-parse HEAD` must equal the expected revision recorded by the packaging repository.
4. The packaging command records the revision in build metadata but never checks out, resets, patches, installs into, or generates files inside upstream.

Dependency installation uses the outer repository's store and `node_modules`. Commands that would run upstream lifecycle scripts or rewrite the upstream lockfile are forbidden. Source packages are consumed through read-only links for compilation or through package archives produced in an outer temporary staging directory.

Tests snapshot upstream `HEAD`, status, and a content digest before a packaging operation and assert all three remain unchanged afterward.

## Packaging Workspace

The outer repository owns a minimal pnpm workspace containing only private packaging packages. It may reference upstream packages for reading and deployment, but it must not add workspace declarations to upstream.

Desktop runtime assembly starts from the upstream published/build artifacts and copies them into a temporary deploy tree with fresh inodes. Packaging-owned extensions, including the mail service package and private dsh installation wrapper, are then layered into that deploy tree. No symlink inside a shipped `.app` may point back to either repository.

The production `.app` contains private Node, dsh, and package-manager resources. The host does not install or discover those tools. Plugin installation changes only the application-owned Harness data directory.

## Mail Plugin Boundary

The complete mail plugin moves under outer `plugins/mail`. Its publish archive declares plugin-owned libraries as dependencies and product capabilities as peers. If a required peer is not present in public upstream, the outer `packages/mail` capability is included in the private Desktop runtime closure; upstream source is not modified to add it.

Acceptance installs the complete mail archive through the private bundled dsh path in one operation and boots immediately. Source-directory installation and `link:` profiles are excluded from production acceptance.

## Failure Safety

Migration stops before resetting upstream if any expected Desktop/mail file cannot be extracted or compared with the archive branch. A manifest containing the archive commit and extracted file hashes is written to the outer repository first.

The inner reset is allowed only after the backup branch resolves to the original commit and the extraction manifest verifies. Directory rename occurs only after `master == origin/master` and the working tree is clean.

If any later packaging operation detects a dirty upstream checkout, it fails without attempting cleanup. Automatic reset or repair would risk deleting upstream developer work and is prohibited.

## Verification

- The outer directory is an independent Git repository with packaging files tracked.
- `upstream` is a relative symlink to `deepseek-harness-source`.
- Inner `master` equals `origin/master`, while `archive/desktop-packaging-20260818` equals `2c4cf69b2f`.
- Inner status is clean before and after outer install, test, stage, and build commands.
- No tracked outer file except the `upstream` symlink is located inside the inner checkout.
- Built runtime and `.app` contain no symlink or absolute path referencing either checkout.
- Existing Desktop tests run from the outer workspace after their imports and paths are adapted.
- The packaged mail plugin installs once through bundled dsh and the Desktop profile boots without repair.
