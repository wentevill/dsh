# dsh-nextcloud

DeepSeek Harness 的单账号 Nextcloud 文件与共享插件。它使用 Nextcloud WebDAV、OCS API 和应用密码提供文件操作，以及公开链接、用户和群组共享工具。

## 安装

```sh
make pack-plugin PLUGIN=nextcloud
make install-plugin PLUGIN=nextcloud
```

也可以把生成的 `dsh-nextcloud-0.1.0.tgz` 拖入 Desktop 的插件管理器。插件独立安装，不随 Desktop 默认预装。

安装后打开 **Settings → Plugins → Nextcloud 文件**，填写服务器根地址（包含部署子路径但不要包含 `/remote.php/dav`）、用户名和 Nextcloud 应用密码。应用密码只保存在 Harness credentials 的 `NEXTCLOUD_APP_PASSWORD` 中。

访问范围可以选择整个账号文件区，或配置多个绝对目录白名单。白名单同时约束读取路径以及移动操作的源和目标。删除默认关闭；启用后仍需要每次人工审批，并且不能删除文件根目录或白名单根本身。

默认只允许证书有效的 HTTPS。设置卡可以分别显式允许 HTTP 或跳过 TLS 证书校验，这两个选项会降低连接安全性。

文本文件通过 `nextcloud_read` 分段返回。非文本文件以及超过 100 MiB 的文件自动下载到当前 session 工作区的 `.nextcloud-downloads/`；已有文件不会被覆盖。上传只能读取当前 session 工作区中的普通文件。所有远端写操作均要求新鲜人工审批。

共享工具支持列出和查看共享、搜索本地用户与群组，以及创建、更新和取消共享。权限档位包括只读、可编辑（不包含再次共享权限）和 File Drop；File Drop 仅适用于目录的公开链接。公开链接可设置密码、到期日、备注和标签。共享密码仅写入 Nextcloud，不会出现在工具结果、日志或审批文案中。创建、修改和取消共享均需要每次人工审批，并受相同目录访问范围约束。

## 真实实例测试

默认测试使用受控的本地协议替身。要运行只读真实实例冒烟测试，请设置：

```sh
NEXTCLOUD_TEST_URL=https://cloud.example.com \
NEXTCLOUD_TEST_USERNAME=test-user \
NEXTCLOUD_TEST_APP_PASSWORD=app-password \
corepack pnpm --dir plugins/nextcloud test
```

自签名或 HTTP 测试实例可分别设置 `NEXTCLOUD_TEST_SKIP_TLS_VERIFY=1`、`NEXTCLOUD_TEST_ALLOW_HTTP=1`。

要求 Node.js 24 或更高版本。
