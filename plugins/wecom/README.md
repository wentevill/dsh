# dsh-wecom

DeepSeek Harness 标准企业微信 AI 插件，内置官方 `@wecom/cli` 与 `@wecom/aibot-node-sdk`。

安装插件后，在 **Settings → Plugins → 企业微信 AI** 中点击“授权企业微信”，使用企业微信扫描二维码。一次扫码会安全保存 Bot ID/Secret、配置 CLI，并启动 WebSocket 消息通道；配置页分别显示 API 同步状态与通道连接状态。

授权完成后，插件会发现当前机器人可用的 API 并注册为 `wecom_*` 工具。读取操作可直接执行；写入及未知操作会触发 Harness 人工审批。WebSocket 收到消息时，每个企业微信房间固定映射到一个 Harness session；同房间消息串行、不同房间并行，回复通过原始回调 `req_id` 被动引用。网络中断会指数退避重连，插件卸载会停止连接并排空所属任务。

CLI 授权数据默认保存在 `$DSH_HOME/profiles/<profile>/plugins/wecom`，Bot 凭据由 Harness credentials 组件保存，房间映射由 `storageDomain` 保存；消息内容只存在 Harness session 中。非 `web` profile 请修改插件的 `profile`；也可以用绝对路径 `configDir` 覆盖。删除授权会停止通道并删除 Bot/CLI 授权，但保留房间到 session 的映射。

```sh
corepack pnpm --dir plugins/wecom pack
dsh plugin --profile web add ./plugins/wecom/dsh-wecom-0.2.0.tgz
```

要求 Node.js 24 或更高版本。
