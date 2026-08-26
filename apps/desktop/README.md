# DeepSeek Harness Desktop for macOS

English | [中文](README.zh.md)

This package is a Tauri host for the existing DeepSeek Harness Web UI. It does not compile or fork the Harness UI: packaging stages the built `@deepseek-ai/dsh` package graph, and the application launches its `lib/bin.js` with the bundled Node.js runtime.

## Requirements

- macOS on Apple Silicon
- Rust stable with the `aarch64-apple-darwin` target
- Node.js compatible with the repository and Corepack/pnpm 11.7.0
- Existing workspace build artifacts (`pnpm run build` from the repository root)

## Stage and verify the runtime

Download `node-v24.7.0-darwin-arm64.tar.gz` from the official Node.js distribution, then run:

```sh
cd apps/desktop
npm run stage:runtime -- --archive /path/to/node-v24.7.0-darwin-arm64.tar.gz
npm run audit:runtime
```

Staging verifies the pinned SHA-256, keeps only the Node executable and production package graph, and sanitizes build-machine paths. The private runtime contains upstream `dsh` and pnpm 11.7.0. Tauri prepends its private Node and package bin directories only to the DSH child process; it does not install tools or modify PATH on the host.

The runtime also contains a self-contained `dsh-plugin-manager` archive. Before
the Web server starts, Desktop installs the bundled version when the profile is
missing it or has another version. In Settings, **Plugin manager** appears after
**Plugin list**. It installs one dragged `.tgz` immediately, lists additional
bundle dependencies by npm name and version, and exposes uninstall inside each
expanded card. The manager itself cannot be replaced or removed from this page.
All changes require a manual restart.

Production plugins must be complete registry, URL, or `.tgz` packages. Source-directory links are unsupported. The release acceptance command is `npm run test:plugin-install`: it uses the staged Node, upstream dsh, and private pnpm to install the repository-owned mail archive once into a fresh profile and compose it immediately without a repair step.

## Build

```sh
npm test
npm run test:plugin-install
npm run build
```

Unsigned artifacts are written below `apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/`. Audit the `.app` before distribution with `npm run audit:app -- <path-to-app>`.

The MVP adds no authentication, transport protection, Computer runtime, VM, or isolation boundary. It listens only through the existing DSH Web profile's loopback behavior. macOS may require Control-click → Open for an unsigned application.
