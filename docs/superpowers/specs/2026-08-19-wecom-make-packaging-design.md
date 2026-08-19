# WeCom Make Packaging Design

## Goal

Extend the root Makefile's existing plugin workflow so the completed `dsh-wecom` package can be packed and installed with the same commands as `dsh-mail`.

## Interface

- `make pack-plugin PLUGIN=wecom` builds `plugins/wecom/dsh-wecom-<version>.tgz`.
- `make install-plugin PLUGIN=wecom PROFILE=web` packs the archive and installs that exact file through the Desktop application's bundled `dsh` CLI.
- `PLUGIN=mail` remains the default and retains its current behavior.
- Any plugin name other than `mail` or `wecom` fails during Makefile evaluation.

## Implementation

The Makefile selects the package directory, npm package name, version, archive path, and existing root package script from `PLUGIN`. It remains a thin orchestration layer; plugin compilation and npm packaging stay owned by each plugin package. The root `package.json` gains a `wecom:pack` script parallel to `mail:pack`.

## Verification

Packaging tests exercise Make dry-runs for both supported plugins, assert their selected pack command and archive path, verify installation still emits one `dsh plugin --profile ... add ...` invocation, and retain the unsupported-plugin failure check. A real `make pack-plugin PLUGIN=wecom` run must produce the expected archive.
