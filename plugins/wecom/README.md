# dsh-wecom

DeepSeek Harness 标准企业微信 AI 插件，内置官方 `@wecom/cli`。

安装插件后，在 **Settings → Plugins → 企业微信 AI** 中点击“授权企业微信”，使用企业微信扫描二维码。授权完成后，插件会发现当前机器人可用的 API 并注册为 `wecom_*` 工具。读取操作可直接执行；写入及未知操作会触发 Harness 人工审批。

授权数据默认保存在 Harness 工作目录下的 `.dsh/wecom`，可通过插件的 `configDir` 修改。删除授权只会删除该目录中的 `credentials.enc`、`.encryption_key` 与 `cache`。

```sh
corepack pnpm --dir plugins/wecom pack
dsh plugin --profile web add ./plugins/wecom/dsh-wecom-0.1.0.tgz
```

要求 Node.js 24 或更高版本。
