# DeepSeek Harness Desktop 打包项目

本仓库负责围绕开源 DeepSeek Harness 构建私有 macOS Desktop 发行包，不拥有也不修改 upstream 源代码。`upstream` 是指向固定 GitHub checkout 的相对软链接；Tauri、runtime 组装、发布审计和 DMG 创建位于 `apps/desktop/`。

打包前可运行 `corepack pnpm run verify:upstream`。Desktop staging 与 build 会自动执行该检查；upstream checkout 变脏、remote 改变或版本偏离 `upstream.lock.json` 都会直接失败。

## Make 命令

在仓库根目录执行：

```sh
make release-dmg     # 构建并审计 release app 和 DMG
make run             # 启动 Tauri 开发模式
make pack-plugin     # 生成 mail 插件生产 tgz
make install-plugin  # 打包并安装 mail 到 Desktop web profile
```

执行 `make install-plugin` 前请退出已经安装的 DeepSeek Harness，避免同时读写 profile。安装过程只使用 `/Applications/DeepSeek Harness.app` 内置的 Node、dsh CLI 和 pnpm，并明确写入 Desktop 数据目录，不会写入默认的 `~/.dsh`。

可以覆盖应用路径和 profile：

```sh
make install-plugin APP_PATH="/Applications/DeepSeek Harness.app" PROFILE=web
```

支持的变量为 `APP_PATH`、`PLUGIN=mail`、`PROFILE` 和 `DESKTOP_DSH_HOME`。运行 `make help` 查看命令摘要。

选择新的 GitHub revision 前请阅读 [更新 upstream](docs/operations/upstream-update.md)。
