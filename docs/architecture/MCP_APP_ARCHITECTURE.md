# MCP 与 MCP Apps 目标架构

> 文档状态：Future Design / Not in Local MVP  
> 更新日期：2026-07-30

## 1. 当前边界

当前本地 MVP 不包含：

- MCP Client；
- MCP Server；
- MCP Gateway；
- `mcp-configs` Runtime；
- 原生 MCP Apps HTML UI Resource；
- MCP App AIUI 降级页面；
- OAuth 和远程 Tool 授权。

当前 AIX 只包含本地 `LanguageModel.tools`、本地 Moment CRUD 和两种只读对话流卡片：

```text
pages/cards/moment-result
pages/cards/memory-answer
```

## 2. 未来目标

未来跨平台阶段采用：

```text
Agent Host
  -> Moment MCP Server
  -> Auth / Scope / Policy
  -> Moment Domain Service
  -> Cloud Repository
  -> Tool Result
  -> Text / Structured Content / MCP App
```

Moment One 还可以作为 MCP Consumer 调用用户授权的日历、健康、云盘等服务，但 Provider 和 Consumer 必须分开配置、授权和审计。

## 3. MCP Apps UI

计划提供：

```text
ui://moment-one/timeline
ui://moment-one/search
ui://moment-one/moment-detail
ui://moment-one/daily-review
ui://moment-one/delete-confirmation
```

每个关联 Tool 同时返回：

- `structuredContent`：供 UI 使用；
- 文本 `content`：供不支持 MCP Apps 的 Host 降级；
- UI Resource metadata：供支持的 Host 加载。

MCP App 不保存长期凭据，不直接连接数据库。所有读取和写入通过 Host Bridge 调用 MCP Tool。

## 4. 与 AIUI 卡片的关系

AIUI 对话流卡片保持只读。未来如果需要在 Rokid 上展示 MCP Tool Result，应适配为 Moment One 自己的 ViewModel，而不是直接假设 AIUI 可以运行任意 MCP Apps iframe。

```text
MCP Tool Result
  -> Shared ViewModel
  -> MCP Apps UI / AIUI Card / Native Mobile UI
```

## 5. 与传统客户端的关系

MCP Apps 不替代手机和 Web：

```text
Agent Host -> MCP Server -> MCP App
Mobile/Web -> App API -> Native UI
```

两者共享 Moment Domain 和 ViewModel，不强制共享 UI Runtime。

## 6. 安全要求

未来实现必须满足：

- MCP 工具必须 Allowlist；
- MCP Tool 不接受任意 `userId`；
- 身份来自 OAuth Token；
- 写入、删除和外部副作用必须确认；
- Tool Result 必须限制大小并记录来源；
- 不通过 MCP JSON 传输 Base64 媒体；
- MCP App 和 AIX 不包含长期密钥；
- Host 不支持 MCP Apps 时仍可完成文本或结构化降级。

## 7. 实现触发条件

只有以下条件完成后才开始 MCP Apps Runtime 开发：

- 本地 MVP Tool Schema 稳定；
- Cloud Moment Repository 可用；
- 只读 Moment MCP Server 可用；
- OAuth、Scope 和审计可用；
- Mobile/Web ViewModel 初步稳定；
- 已选定至少一个目标 MCP Apps Host 做兼容测试。

详细 Tool 契约见 [Moment One MCP Server 契约](../contracts/MCP_SERVER_CONTRACT.md)，身份与同步见 [身份、同步与安全](../security/IDENTITY_SYNC_SECURITY.md)。
