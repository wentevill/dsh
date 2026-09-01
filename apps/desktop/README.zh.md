# DeepSeek Harness macOS Desktop

[English](README.md) | 中文

本包是现有 DeepSeek Harness Web UI 的 Tauri 宿主。它不编译或派生 Harness UI；打包阶段只部署已构建的 `@deepseek-ai/dsh` package graph，应用使用内置 Node.js 启动其中的 `lib/bin.js`。

## 要求

- Apple Silicon Mac
- Rust stable，已安装 `aarch64-apple-darwin` target
- 满足仓库要求的 Node.js，以及 Corepack/pnpm 11.7.0
- 已在仓库根目录执行 `pnpm run build`，生成现有 workspace 构建产物

## 生成并检查 runtime

从 Node.js 官方发行目录下载 `node-v22.19.0-darwin-arm64.tar.gz`，然后执行：

```sh
cd apps/desktop
npm run stage:runtime -- --archive /path/to/node-v22.19.0-darwin-arm64.tar.gz
npm run audit:runtime
```

staging 会校验固定 SHA-256，只保留 Node 可执行文件和 production package graph，并清除构建机路径。私有 runtime 包含 upstream `dsh` 和 pnpm 11.7.0。Tauri 只为 DSH 子进程前置包内 Node 与 package bin 路径，不会在宿主机安装工具或修改宿主 PATH。

runtime 还内置自包含的 `dsh-plugin-manager` 安装包。启动 Web 服务前，Desktop 会在 profile 缺失管理器或版本不一致时同步内置版本。设置页中的 **插件管理** 位于 **插件列表** 之后：每次拖入一个 `.tgz` 后立即安装，额外 bundle 依赖按 npm 包名和版本显示，展开卡片后可以卸载。管理器自身不能在此处替换或卸载，所有变更都需要手动重启后生效。

生产插件必须是完整的 registry、URL 或 `.tgz` 包，不支持源码目录链接。发布验收命令 `npm run test:plugin-install` 使用 staged Node、upstream dsh 和私有 pnpm，在全新 profile 中一次安装仓库内 mail 包并立即组合，不执行任何修复步骤。

## 构建

```sh
npm test
npm run test:plugin-install
npm run build
```

未签名产物位于 `apps/desktop/src-tauri/target/aarch64-apple-darwin/release/bundle/`。分发前使用 `npm run audit:app -- <path-to-app>` 检查 `.app`。macOS 可能要求通过右键“打开”启动未签名应用。

MVP 不增加独立认证层、传输防护、Computer runtime、VM 或隔离边界；它保留 DSH Web profile 现有的 token 换取 cookie 认证与仅 loopback 监听行为。
