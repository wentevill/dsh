# DeepSeek Harness 企业微信插件设计

## 目标

为 DeepSeek Harness Desktop 提供可安装的 `dsh-wecom` 插件。插件封装官方 `wecom-cli`，通过企业微信在线 discovery 动态注册账号实际可用的 API，并在 Plugin configuration 中完成扫码授权、状态展示、API 刷新和授权删除。

插件不复制企业微信的固定接口目录，不直接实现企业微信私有协议，也不向模型暴露任意 CLI 命令。企业微信新增或调整远程方法后，插件通过 Schema 刷新获得变化，并继续在 DeepSeek Harness 的工具参数校验、审批和会话记录机制内执行。

## 范围

第一版包含：

- 将 `@wecom/cli` 作为插件依赖随生产 `.tgz` 分发；
- Plugin configuration 扫码授权；
- 授权状态与非敏感 Bot 信息展示；
- 删除当前 DSH profile 的授权；
- 在线服务目录和方法 Schema 获取、校验与缓存；
- 动态 DSH tool 注册、刷新与卸载；
- 读写分类和变更操作审批；
- CLI 进程取消、超时、输出限制、JSON/NDJSON 解析和错误脱敏；
- Host/Client 配置卡片、Typert Remote 和打包安装验证。

第一版不包含手动输入 Bot ID/Secret、周期日程或周期会议能力补偿、企业微信 API 的静态 TypeScript 客户端，以及绕过 `wecom-cli` 的 HTTP 调用。

## 包结构

插件沿用仓库 `plugins/mail` 的生产包模式：

```text
plugins/wecom/
├── package.json
├── cordis.patch.yml
├── src/
│   ├── index.ts
│   ├── discovery.ts
│   ├── tool-adapter.ts
│   ├── transport.ts
│   ├── policy.ts
│   ├── errors.ts
│   ├── remote-settings.ts
│   └── client/
│       ├── index.ts
│       ├── WeComCard.tsx
│       └── wecom-card-controller.ts
├── tests/
└── README.md
```

`index.ts` 负责 Host 生命周期、设置卡片注册、授权状态转换和动态工具集合的所有权。`transport.ts` 是唯一允许启动 `wecom-cli` 的模块。`discovery.ts` 获取并校验在线目录。`tool-adapter.ts` 把受支持的企业微信参数和返回 Schema 转换为 DSH 工具定义。`policy.ts` 负责操作分类和审批摘要。Client 卡片只调用插件拥有的固定 Remote 方法，不接受任意命令或路径。

## 授权与 Plugin configuration

### 状态

配置卡片使用以下状态：

```text
unauthorized
  -> generating_qr
  -> awaiting_scan
  -> authorized
  -> refreshing_schema
  -> ready

awaiting_scan
  -> expired | cancelled | failed
  -> unauthorized

ready
  -> deleting
  -> unauthorized
```

授权成功而 Schema 同步失败时保持 `authorized`，显示“已授权，API 同步失败”和重试按钮，不把同步故障误报成未授权。

### 未授权

Host 启动时执行 `wecom-cli auth show --status`。未授权时不注册企业微信业务工具，但插件、Remote 服务和配置卡片保持可用。卡片显示“未授权”和“连接企业微信”按钮。

点击按钮后，Host 在插件专用临时目录中执行：

```sh
wecom-cli auth init --noninteractive --no-browser --output-qrcode qr.png
```

执行使用可执行文件和参数数组，不经过 shell。`qr.png` 是相对于受控工作目录的固定文件名。Host 只通过插件专用 Remote 返回二维码内容和授权状态，Client 不读取任意主机文件。扫码等待沿用 `wecom-cli` 的五分钟超时；用户可以取消或在过期后重新生成。

扫码进程成功结束后，Host 再次检查 `auth show --status`。只有状态为 `authorized` 才进入 discovery 和工具注册。

### 已授权

配置卡片显示：

- 已授权状态；
- 非敏感 Bot ID；
- API 是否同步成功；
- 最近一次成功同步时间；
- “刷新 API”和“删除授权”按钮。

卡片不显示 Secret、access token、加密密钥或凭证绝对路径。

### 删除授权

删除授权需要二次确认。确认后 Host：

1. 阻止新的企业微信调用并取消仍在运行的调用；
2. 注销当前动态工具集合；
3. 删除当前 profile 的 `credentials.enc`、插件拥有的回退加密密钥和 discovery 缓存；
4. 重新执行授权状态检查；
5. 将配置卡片切回未授权状态。

删除逻辑只操作由插件解析和验证的精确文件路径，不接收 Client 或模型提供的路径，不递归删除插件配置根目录。

### 凭证目录

插件为每个 DSH profile 设置独立的 `WECOM_CLI_CONFIG_DIR`。凭证由 `wecom-cli` 以 AES-256-GCM 管理，文件权限保持 `0600`，加密密钥优先进入系统 keyring；文件回退仍限制在该 profile 的插件配置目录。凭证不得进入 Cordis 配置、DSH settings、环境文件、模型工具参数、会话日志或普通诊断日志。

## 动态 discovery 和工具注册

授权后插件执行 `wecom-cli schema list` 获取账号实际开放的服务和方法。工具名由完整方法路径确定，例如：

```text
message.aibot.sessions.list -> wecom_message_aibot_sessions_list
contact.users.search        -> wecom_contact_users_search
doc.search                  -> wecom_doc_search
```

名称转换必须可重复、无冲突。两个远程路径映射到同一工具名时，整次刷新失败并保留上一份有效集合。

插件只转换 DSH 参数 DSL 能完整表达的 Schema。无法无损转换的 Schema 不注册，并在配置卡片诊断中列出方法和原因。参数在进入 transport 前由 DSH 工具层校验；插件再检查 CLI 和文件操作所需的跨字段约束。

刷新采用两阶段替换：先获取、校验并构建完整候选集合，然后在同一插件生命周期内替换旧注册。候选构建失败时旧集合继续服务，避免出现部分新、部分旧的 API 目录。

工具结果保存规范化 JSON 值。默认 JSON 输出解析为一个值，自动分页的 NDJSON 解析为页数组。日志和提示只走受限 stderr，不能混入规范结果。下载结果必须返回 DSH 可识别的受控文件位置，不能允许企业微信参数把文件写到任意系统路径。

## 操作分类与审批

插件根据完整方法路径、方法文档和 Schema 元数据分类。方法名只是输入信号，不是唯一授权依据。

- 读取：`get`、`list`、`search`、`show`、`status`、`whoami` 以及确认只读的方法，可直接执行；
- 变更：`send`、`create`、`update`、`append`、`upload`、`rename`、`finish` 等需要标准审批；
- 高风险变更：`delete`、`cancel`、覆盖写入、权限修改、成员移除等需要明确的高风险审批；
- 未知、冲突或元数据不足的方法默认按高风险变更处理。

审批卡片展示业务对象、目标、操作类型和有界内容摘要。例如发送消息显示会话名、消息类型和内容摘要；删除待办显示标题与 ID；修改权限显示文档和成员。审批投影必须脱敏，并且是工具参数和规范化策略元数据的纯函数，以便会话重放得到相同结果。

模型不能调用授权、删除授权、刷新 Schema 或任意 CLI 命令。这些操作只存在于 Plugin configuration Remote。

## 进程与错误处理

`transport.ts` 通过 DSH 子进程能力或其受控本地实现启动插件随包携带的 `wecom-cli`。每次调用必须：

- 使用固定可执行文件和参数数组；
- 使用当前 profile 的配置目录和插件临时目录；
- 接受并传播 `AbortSignal`；
- 执行可配置的超时和并发上限；
- 限制 stdout、stderr 和下载大小；
- 检查退出码并解析结构化错误；
- 清除或脱敏 Secret、token、额外请求头和主机路径。

退出码 `2` 映射为参数或 Schema 不匹配，退出码 `1` 映射为鉴权、网络、IO 或企业微信业务错误。企业微信原始 `errcode` 可以保留为非敏感结构化错误标识。畸形 JSON、超限输出和进程异常都作为工具错误返回，不得把未经处理的 stdout/stderr 直接交给模型。

授权失效时，当前调用返回鉴权错误，插件将状态降为未授权并注销业务工具。网络故障或单个业务错误不得删除授权。

## 安装与组合

`dsh-wecom` 作为完整生产 `.tgz` 安装：

```sh
dsh plugin --profile web add ./dsh-wecom-0.1.0.tgz
```

`cordis.patch.yml` 挂载 Host 插件和 Client 配置卡片。包声明所需的 DSH 能力为 peer dependencies，把 `@wecom/cli` 及其运行时依赖作为普通 dependencies 打入安装闭包。Desktop 安装验证使用 staged Node、staged dsh 和全新 profile，不依赖主机全局 `wecom-cli`。

## 测试与验收

单元和集成测试覆盖：

- 未授权、生成二维码、等待、过期、取消、成功和失败状态；
- 授权成功但 Schema 同步失败的独立状态；
- 删除授权的确认、运行调用取消、工具卸载和精确文件删除；
- Secret 不进入命令参数、日志、settings、Remote 结果和模型结果；
- Schema 转换、名称冲突、不支持类型和两阶段替换；
- 读取、标准变更、高风险变更和未知方法的策略分类；
- CLI 超时、取消、非零退出、畸形 JSON、NDJSON 和输出超限；
- 工作区或插件临时目录以外的下载目标被拒绝；
- 全新 Desktop profile 中生产 `.tgz` 一次安装后立即组合；
- keyless DSH snapshot 固定模型看到的动态工具目录、审批反馈和授权失效行为。

验收要求：未授权时配置卡片可完成扫码且模型看不到企业微信工具；授权和 Schema 同步成功后工具集合与 discovery 一致；所有变更操作经过正确等级的审批；删除授权后工具立即消失且凭证不可恢复；任何可观察输出均不包含凭证材料。
