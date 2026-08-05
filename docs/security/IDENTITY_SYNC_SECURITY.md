# 身份、同步与安全

> 文档状态：Draft 1.0  
> 更新日期：2026-07-30

## 1. 威胁模型

Moment One 处理第一视角画面、语音、地点、人物、日程和生活习惯，默认按高敏感个人数据设计。

主要风险：

- Agent 越权读取其他用户 Moment；
- MCP Client 获得过宽权限；
- 模型错误执行写入或删除；
- AIX 或移动客户端包含长期凭据；
- 媒体通过日志或 Tool Result 泄露；
- 离线设备产生覆盖冲突；
- Host 缓存或转发私人结果；
- 用户无法知道哪个 Agent 访问过数据。

## 2. 身份模型

建议实体：

```text
User
Device              可识别的物理设备（如 Rokid 眼镜）
DeviceBinding        设备与用户的长期绑定关系（扫码绑定的产物，可撤销）
OAuthClient
ServiceAccount
AgentConnection
Session
AccessGrant
```

服务器从 Access Token 推导用户身份。禁止 MCP Tool 或 App API 客户端自由提交目标 `userId`。

**DeviceBinding 是眼镜端的核心概念**：扫码建立的不是一次性 Token，而是设备与账号的长期绑定关系。绑定后 Token 可过期和刷新（无需重新扫码），绑定可由用户撤销。Moment 的 `provenance.deviceId` 记录创建该 Moment 的设备，可追溯数据来源。

Moment One 支持三种 OAuth 授权流程（根据客户端能力选择）：

- **浏览器跳转**（Web / Mobile / ChatGPT / Claude Desktop）：Authorization Code + PKCE
- **扫码设备绑定**（眼镜端）：Web 端显示二维码，眼镜用摄像头扫描建立 DeviceBinding（自定义 Extension Grant）
- **机器间授权**（后台服务 / CI/CD）：Client Credentials（SEP-1046）

设备绑定的权威授权契约见 `MomentOneServer/docs/domain/DEVICE_BINDING.md`。

## 3. Scope

建议：

```text
moments.read
moments.write
moments.delete
moments.media.read
moments.media.write
moments.config.read
moments.config.write
moments.audit.read
```

默认授权只读；删除、媒体和配置写入单独授权。

## 4. 审计

每次 Agent 或设备访问记录：

```ts
interface AuditEvent {
  id: string;
  userId: string;
  actorType: 'device' | 'mobile' | 'web' | 'agent' | 'mcp';
  actorId: string;
  action: string;
  toolName?: string;
  momentIds?: string[];
  resultCount?: number;
  confirmationId?: string;
  allowed: boolean;
  reason?: string;
  createdAt: string;
}
```

手机和 Web 必须提供“Agent 访问记录”页面。

## 5. 离线同步

### 5.1 Repository

```text
SyncingMomentRepository
├── LocalMomentRepository
├── CloudMomentRepository
└── SyncOutbox
```

### 5.2 创建

客户端生成 UUID，先写本地：

```json
{
  "id": "client-generated-uuid",
  "revision": 0,
  "syncState": "pending"
}
```

同步成功后更新 Cloud Revision。

### 5.3 修改

云端采用乐观锁：

```text
expectedRevision
```

Revision 不一致时返回 `REVISION_CONFLICT`，不静默覆盖。

### 5.4 删除

使用 Tombstone：

```json
{
  "deletedAt": "2026-07-30T12:00:00+08:00",
  "revision": 4
}
```

确保离线设备同步后也能正确删除本地副本。

### 5.5 冲突

第一阶段可采用：

- 不同字段自动合并；
- 同字段冲突保留两份版本；
- 手机端提供人工合并。

## 6. 媒体安全

媒体上传流程：

```text
Client -> Request Upload Intent
Client -> Object Storage
Client -> Create/Update Moment with assetId
```

规则：

- 不通过 MCP JSON 传 Base64；
- 使用短期上传 URL；
- 下载使用短期签名 URL；
- 生成缩略图和脱敏派生资源；
- MCP 默认不返回原图；
- Trace 不记录图片数据；
- 删除 Moment 时执行媒体引用计数或延迟清理。

## 7. Tool Policy

### 7.1 读取

只允许读取当前 Token 用户数据，限制查询范围和返回数量。

### 7.2 创建

必须有明确用户记录表达，支持 Idempotency Key。

### 7.3 修改

必须精确定位目标并验证 Revision。

### 7.4 删除

必须经过 Preview 和 Confirm 两阶段，Confirmation 单次使用且有短 TTL。

### 7.5 外部 MCP

外部 MCP 工具必须 Allowlist。写入、发送消息、删除和其他副作用需要用户确认。

## 8. 客户端凭据

- AIX 不包含长期 API Key；
- MCP Apps 不包含 OAuth Refresh Token；
- 移动端使用系统安全存储；
- 眼镜端通过扫码设备绑定建立 DeviceBinding（Web 端显示二维码，眼镜摄像头扫描）；绑定后获得短期 Access Token（有效期以 Server 返回的 `expires_in` 为准）+ Refresh Token（30 天硬上限、不滚动）；Access Token 可在 Refresh Token 有效期内刷新，Refresh Token 过期或绑定撤销后需重新扫码；
- MCP Client（第三方 Agent）使用 OAuth 2.1 + PKCE；Token 由 Host 管理，不长期存储明文；
- 后台服务 / CI/CD 使用 Client Credentials Grant（SEP-1046）；推荐 JWT Bearer Assertion；
- 服务端密钥只存在服务端 Secret Manager；
- 日志不得输出 Authorization Header。

## 9. 数据权利

平台需要支持：

- 导出用户全部 Moment；
- 删除账号和云端数据；
- 撤销 Agent/MCP Client 授权；
- 查看访问审计；
- 限制某个 Client 的 Scope；
- 清理媒体和派生索引；
- 设置数据保留策略。
