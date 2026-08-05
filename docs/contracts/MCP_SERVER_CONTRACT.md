# Moment One MCP Server 契约

> 文档状态：Draft 1.0  
> 更新日期：2026-07-30

> 当前本地 MVP 不实现此 Server。本文件用于稳定未来工具命名、输入输出、安全和版本约束。

## 1. 目标

Moment MCP Server 让第三方或第一方 Agent 在用户授权后查询和操作该用户自己的 Moment。

第一阶段默认只读。写入、修改和删除能力在身份、Scope、审计和确认机制完成后逐步开放。

## 2. 传输与端点

推荐远程端点：

```text
https://api.example.com/mcp
```

使用 Streamable HTTP，通过 OAuth Access Token 识别用户。MCP Server 不接受 Tool 参数中的任意 `userId`。

### 2.1 授权方式

不同客户端通过不同授权方式获得 Access Token，但 MCP Server 只关心 Token 验证，不关心 Token 获取方式：

| 客户端 | 授权方式 | 说明 |
|---|---|---|
| ChatGPT / Claude 等 MCP Client | OAuth User Context | 用户在 MCP Client 中授权 |
| 眼镜端 | 扫码设备绑定（QR Binding） | 建立 DeviceBinding 后获得 Access Token，详见 `MomentOneServer/docs/domain/DEVICE_BINDING.md` |
| Web / Mobile | OAuth Authorization Code + PKCE | 浏览器跳转 Casdoor 登录 |

眼镜端通过扫码绑定建立 **DeviceBinding**（设备与用户的长期绑定关系），绑定后获得短期 Access Token（有效期以 `expires_in` 为准）+ Refresh Token（30 天硬上限、不滚动）。MCP Server 验证 Access Token 后即可识别用户身份，无需感知绑定细节。

## 3. Tools

### 3.1 `moments_search`

用途：按自然语言、时间、类别、地点和标签查询 Moment。

输入：

```json
{
  "query": "我上周去过哪里",
  "timeRange": {
    "from": "2026-07-20T00:00:00+08:00",
    "to": "2026-07-27T00:00:00+08:00"
  },
  "categories": ["travel"],
  "limit": 10,
  "cursor": null
}
```

输出：

```json
{
  "total": 2,
  "items": [
    {
      "id": "a1b2c3d4-1234-5678-9abc-def012345678",
      "title": "西湖边散步",
      "occurredAt": "2026-07-25T08:30:00+08:00",
      "locationName": "西湖",
      "aiSummary": "在西湖边散步。",
      "tags": ["旅行", "散步"],
      "revision": 3
    }
  ],
  "nextCursor": null
}
```

### 3.2 `moments_list`

用途：按时间倒序列出 Moment，不进行语义搜索。

建议参数：

```text
from
to
limit
cursor
categories
```

### 3.3 `moments_get`

输入：

```json
{
  "momentId": "a1b2c3d4-1234-5678-9abc-def012345678"
}
```

输出完整但经过 Scope 裁剪的 Moment。媒体默认返回元数据和短期签名地址，不返回 Base64。

### 3.4 `moments_count`

用于数量统计，避免 Agent 获取大量记录后自行计数。

### 3.5 `reviews_daily`

输入日期和时区，返回该日 Moment 证据及派生摘要。摘要必须保留引用的 Moment ID。

### 3.6 `moments_create`

第二阶段开放。要求：

- `moments.write` Scope；
- 明确的用户记录意图；
- `idempotencyKey`；
- 来源信息；
- 媒体只提交 `assetId`。

### 3.7 `moments_update`

输入必须包含：

```text
momentId
expectedRevision
changes
idempotencyKey
```

Revision 不一致时返回冲突，不允许静默覆盖。

### 3.8 `moments_delete_preview`

只生成删除预览，不执行删除。

返回：

```json
{
  "confirmationId": "confirm-123",
  "expiresAt": "2026-07-30T13:10:00+08:00",
  "items": [
    {
      "id": "a1b2c3d4-1234-5678-9abc-def012345678",
      "title": "上周吃面",
      "revision": 2
    }
  ],
  "message": "将删除 1 条 Moment"
}
```

### 3.9 `moments_delete_confirm`

输入一次性 `confirmationId`。服务端检查：

- 当前用户；
- Scope；
- 过期时间；
- 是否重复使用；
- Moment Revision；
- 审计上下文。

### 3.10 `memory_config_get` / `memory_config_set`

配置属于用户账号或设备时必须明确区分作用域：

```json
{
  "scope": "device",
  "deviceId": "rokid-123",
  "key": "instant_memory"
}
```

## 4. Resources

建议 URI：

```text
moment://me/today
moment://me/recent
moment://me/moments/{momentId}
moment://me/days/{yyyy-mm-dd}
moment://me/reviews/{yyyy-mm-dd}
```

Resources 默认只读，返回内容必须限制大小和数量。

## 5. Prompts

建议提供：

```text
daily-review
weekly-review
find-a-memory
record-a-moment
correct-a-memory
```

Prompt 只描述推荐交互，不绕过 Tool Policy。

## 6. MCP Apps

建议 UI Resource：

```text
ui://moment-one/timeline
ui://moment-one/search
ui://moment-one/moment-detail
ui://moment-one/daily-review
ui://moment-one/delete-confirmation
```

每个关联 Tool 必须同时返回：

- `structuredContent`：供 UI 使用；
- `content` 文本：供不支持 MCP Apps 的 Host 降级；
- UI Resource metadata：供支持的 Host 加载。

MCP App 不保存长期 Token，不直接连接数据库。需要读取或写入时，通过 Host Bridge 调用 MCP Tool。

## 7. 错误模型

建议稳定错误码：

```text
AUTH_REQUIRED
TOKEN_INVALID
SCOPE_DENIED
MOMENT_NOT_FOUND
TARGET_AMBIGUOUS
REVISION_CONFLICT
CONFIRMATION_REQUIRED
CONFIRMATION_EXPIRED
CONFIRMATION_USED
INVALID_ARGUMENTS
IDEMPOTENCY_CONFLICT
RATE_LIMITED
MEDIA_NOT_READY
MEDIA_TYPE_NOT_ALLOWED
MEDIA_TOO_LARGE
INTERNAL_ERROR
```

错误返回必须可供模型理解，但不得泄露数据库、Token 或内部调用栈。

## 8. 分页和输出限制

- 默认 `limit` 不超过 20；
- 单次 Tool Result 不返回无限列表；
- 使用不透明 Cursor；
- 摘要字段限制长度；
- 媒体返回缩略图和短期 URL；
- Agent 需要更多数据时继续分页调用。

## 9. 版本策略

- Tool 名称尽量稳定；
- 新增字段保持向后兼容；
- 不兼容变更发布新 Tool 或新 Server 版本；
- Tool Result 返回 `schemaVersion`；
- 审计中记录 MCP Client、Tool 名称和 Schema 版本。
