# DeepSeek Harness macOS Desktop

[English](README.md) | 中文

本包是现有 DeepSeek Harness Web UI 的 Tauri 宿主。它不编译或派生 Harness UI；打包阶段只部署已构建的 `@deepseek-ai/dsh` package graph，应用使用内置 Node.js 启动其中的 `lib/bin.js`。

## 要求

- Apple Silicon Mac
- Rust stable，已安装 `aarch64-apple-darwin` target
- 满足仓库要求的 Node.js，以及 Corepack/pnpm 11.7.0
- 已在仓库根目录执行 `pnpm run build`，生成现有 workspace 构建产物

## 生成并检查 runtime

从 Node.js 官方发行目录下载 `node-v24.7.0-darwin-arm64.tar.gz`，然后执行：

```sh
cd apps/desktop
npm run stage:runtime -- --archive /path/to/node-v24.7.0-darwin-arm64.tar.gz
npm run audit:runtime
```

staging 会校验固定 SHA-256，只保留 Node 可执行文件和 production package graph，并清除构建机路径。应用运行时不会查找宿主机的 Node、npm、pnpm、Python 或 Homebrew。

## 构建

```sh
npm test
npm run build
```

未签名产物位于 `apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/`。分发前使用 `npm run audit:app -- <path-to-app>` 检查 `.app`。macOS 可能要求通过右键“打开”启动未签名应用。

MVP 不增加认证、传输防护、Computer runtime、VM 或隔离边界；监听行为沿用 DSH Web profile 的 loopback 实现。
