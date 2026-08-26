# DeepSeek Harness Desktop Packaging

This repository owns the private macOS Desktop distribution around the public
DeepSeek Harness project. It does not own or modify the upstream source.

## Layout

- `upstream` is a tracked relative symlink to the local GitHub checkout in
  `deepseek-harness-source/`.
- `apps/desktop/` owns Tauri, runtime staging, release audits, and DMG creation.
- `packages/mail/` and `plugins/` own private product extensions and publish
  packages.
- `packaging/` owns source-boundary checks and packaging-only orchestration.

Run `corepack pnpm run verify:upstream` before packaging work. Desktop stage and
build scripts call this guard automatically. A dirty checkout, changed remote,
or revision different from `upstream.lock.json` is an error; tooling never
resets or repairs upstream.

Runtime staging exports tracked upstream files with `git archive` into a
temporary writable assembly. Dependency installation, builds, overlays, and
deployment happen there. No generated file or `node_modules` directory is
written through `upstream`.

The pre-separation implementation remains recoverable from the upstream
repository's local branch `archive/desktop-packaging-20260818` at commit
`2c4cf69b2fd5e526831ea7275d6711a2667c8d84`.

See [Updating upstream](docs/operations/upstream-update.md) before selecting a
new GitHub revision.

## Make commands

From the repository root:

```sh
make release-dmg     # build and audit the release app and DMG
make run             # start Tauri development mode
make pack-plugin                       # create the production mail plugin tgz
make pack-plugin PLUGIN=wecom          # create the production WeCom plugin tgz
make pack-plugin PLUGIN=manager        # create the production Plugin manager tgz
make install-plugin PLUGIN=wecom       # pack and install WeCom into the Desktop web profile
```

Quit the installed DeepSeek Harness application before `make install-plugin`
to avoid concurrent access to its profile. Installation uses only the Node,
dsh CLI, and pnpm bundled in `/Applications/DeepSeek Harness.app`; it targets
the Desktop data root rather than `~/.dsh`.

Override paths and selection when needed:

```sh
make install-plugin PLUGIN=wecom APP_PATH="/Applications/DeepSeek Harness.app" PROFILE=web
```

Desktop bundles `dsh-plugin-manager` and keeps its exact version installed in
the `web` profile before starting the Web server. Its **Plugin manager** tab,
immediately after **Plugin list**, accepts one `.tgz` at a time and manages
dependency-backed plugins by package name and installed version. Changes require
a manual application restart.

Supported variables are `APP_PATH`, `PLUGIN=mail|wecom|manager`, `PROFILE`, and
`DESKTOP_DSH_HOME`. Run `make help` for the command summary.
