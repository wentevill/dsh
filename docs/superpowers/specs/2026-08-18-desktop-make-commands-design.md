# Desktop Make Commands Design

## Goal

Add a root `Makefile` that provides memorable entry points for building the release DMG, running Tauri development mode, packing the mail plugin, and installing that plugin into the installed Desktop application's real profile.

## Architecture

The Makefile is a thin orchestration layer over commands already owned by `package.json` and the packaged Desktop runtime. It does not duplicate the Tauri build pipeline, plugin packaging logic, or DSH plugin lifecycle. The open-source upstream checkout remains read-only.

## Targets

- `make help` lists the supported targets and configurable variables.
- `make release-dmg` runs `corepack pnpm desktop:build`, including all existing runtime, plugin-install, app, and DMG audits.
- `make run` runs the existing Tauri development command through `corepack pnpm --dir apps/desktop dev`.
- `make pack-plugin` supports `PLUGIN=mail` and runs the existing mail package command, producing `plugins/mail/dsh-mail-plugin-0.1.0.tgz`.
- `make install-plugin` depends on `pack-plugin`, validates the installed application runtime, and invokes its bundled Node, dsh CLI, and pnpm-compatible private `PATH` with the Desktop application-data `DSH_HOME`.

## Variables

- `APP_PATH ?= /Applications/DeepSeek Harness.app`
- `PLUGIN ?= mail`
- `PROFILE ?= web`
- `DESKTOP_DSH_HOME ?= $(HOME)/Library/Application Support/ai.deepseek.harness/harness`

Only `PLUGIN=mail` is supported in this MVP. Any other value fails with an explicit error instead of silently selecting the wrong archive.

## Installation Flow

`install-plugin` first creates the production tgz. It then checks for the installed application's bundled Node executable, dsh CLI, private pnpm launcher, and generated archive. Finally it executes one `dsh plugin --profile $(PROFILE) add <archive>` command with `DSH_HOME` set to the Desktop application's actual data root and `PATH` restricted to the app runtime plus system utility directories.

The target does not use a host-installed Node, dsh, or pnpm. It does not start, stop, or mutate the installed `.app`; the caller must quit the running Desktop application before installing to avoid concurrent profile access.

## Error Handling

Missing application/runtime artifacts fail before plugin installation. Unsupported plugin names fail before packaging. Shell paths are quoted so spaces in the application and data paths remain data. Each recipe runs in one shell with strict error handling where multiple operations form one target.

## Verification

A packaging test invokes `make -n` with controlled variable values and asserts that expanded commands use the existing package scripts, bundled runtime paths, Desktop `DSH_HOME`, and one plugin-add invocation. It also asserts that an unsupported plugin fails. The existing mail package test verifies the real tgz contents, and the existing plugin-install E2E verifies that the generated archive installs and boots through bundled dsh.

