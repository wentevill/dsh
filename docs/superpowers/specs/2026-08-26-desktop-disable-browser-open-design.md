# Desktop 禁止自动打开浏览器

## 背景

最新上游 Web profile 在本地启动时默认调用系统浏览器。Desktop 启动器复用该 profile，但当前只传入 `--profile web --port 0`，因此启动 Tauri 窗口时会额外打开浏览器。

## 设计

Desktop 启动 bundled DSH 子进程时固定追加上游正式支持的 `--no-open` 参数。该约束属于 Desktop 启动边界：从 Desktop 启动时永远不主动打开系统浏览器，只由 Tauri 窗口加载子进程报告的 loopback URL。

不修改上游 Web profile 的默认值。用户直接运行 `dsh web` 时仍保持上游默认的浏览器打开行为，并可自行使用 `--no-open` 覆盖。

## 测试

为 Desktop lifecycle 增加参数契约回归测试，使用真实 fixture 子进程捕获参数，并断言启动参数包含且只包含预期的 `--profile web --port 0 --no-open` 序列。现有 readiness、进程组和关闭行为保持不变。

## 验收

- 启动 Desktop 不再打开系统浏览器。
- Desktop 窗口仍能连接 bundled Web runtime。
- 直接运行 `dsh web` 的默认行为不受影响。
- Desktop lifecycle 测试与完整 Desktop 构建通过。
