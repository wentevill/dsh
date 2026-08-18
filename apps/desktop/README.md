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

Staging verifies the pinned SHA-256, keeps only the Node executable and production package graph, sanitizes build-machine paths, and never searches for host Node, npm, pnpm, Python, or Homebrew at application runtime.

## Build

```sh
npm test
npm run build
```

Unsigned artifacts are written below `apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/`. Audit the `.app` before distribution with `npm run audit:app -- <path-to-app>`.

The MVP adds no authentication, transport protection, Computer runtime, VM, or isolation boundary. It listens only through the existing DSH Web profile's loopback behavior. macOS may require Control-click → Open for an unsigned application.
