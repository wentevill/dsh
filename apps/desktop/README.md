# DeepSeek Harness Desktop for macOS

English | [中文](README.zh.md)

This package is a Tauri host for the existing DeepSeek Harness Web UI. It does not compile or fork the Harness UI: packaging stages the built `@deepseek-ai/dsh` package graph, and the application launches its `lib/bin.js` with the bundled Node.js runtime.

## Requirements

- macOS on Apple Silicon
- Rust stable with the `aarch64-apple-darwin` target
- Node.js compatible with the repository and Corepack/pnpm 11.7.0
- Existing workspace build artifacts (`pnpm run build` from the repository root)

## Stage and verify the runtime

Download `node-v22.19.0-darwin-arm64.tar.gz` from the official Node.js distribution, then run:

```sh
cd apps/desktop
npm run stage:runtime -- --archive /path/to/node-v22.19.0-darwin-arm64.tar.gz
npm run audit:runtime
```

Staging verifies the pinned SHA-256, keeps only the Node executable and production package graph, and sanitizes build-machine paths. The private runtime contains upstream `dsh` and pnpm 11.7.0. Tauri prepends its private Node and package bin directories only to the DSH child process; it does not install tools or modify PATH on the host.

Plugin management is owned by the upstream Harness runtime. Use the Web
sidebar's **Plugins** page or the bundled `dsh plugin` CLI to install, enable,
disable, and remove bundles. Desktop does not stage a second manager or rewrite
legacy profile dependencies created by older builds.

Production plugins must be complete registry, URL, or `.tgz` packages. Source-directory links are unsupported. The Desktop release runtime does not depend on a repository-owned plugin fixture.

## Build

```sh
npm test
npm run build
```

Unsigned artifacts are written below `apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/`. Audit the `.app` before distribution with `npm run audit:app -- <path-to-app>`.

The MVP adds no independent authentication layer, transport protection, Computer runtime, VM, or isolation boundary. It preserves the existing DSH Web profile's token-to-cookie authentication and loopback-only binding. macOS may require Control-click → Open for an unsigned application.
