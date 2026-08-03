# ADR-0001：存储与 MCP 边界

- 状态：Accepted for Future Direction / Implementation Deferred
- 日期：2026-07-30
- 跨项目统一编号：ADR-0016（见 [ADR_INDEX.md](../../../docs/decisions/ADR_INDEX.md)）

## 背景

当前 Rokid AIUI 客户端使用 `wx.getStorageSync`、`wx.setStorageSync` 和 `wx.removeStorageSync` 保存 Moment 和功能配置。当前 API 能力是 JSON Key-Value Storage，没有已确认的 SQL、SQLite、索引、事务、查询语言或数据库迁移 API。

Moment One 的目标已经扩展为跨平台个人记忆基础设施：

- 眼镜离线记录；
- 手机和 Web 完整展示与管理；
- 其他 Agent 通过 MCP 查询用户授权的 Moment；
- 支持 MCP Apps 对话内 UI。

单设备 Key-Value Storage 不能作为跨平台事实源。

当前产品决策是先完成纯本地 MVP。本文中的 Cloud PostgreSQL、Object Storage 和 MCP Server 仅作为后续边界设计，不进入当前 AIX Runtime。

## 决策

### 1. AIUI 本地存储定位为 Edge Storage

`wx` Storage 只负责：

- 当前设备的离线 Moment 缓存；
- 待同步 Outbox；
- 用户设备配置；
- 短期确认状态；
- 同步 Cursor；
- 网络不可用时的降级。

它不是：

- 跨设备主数据库；
- Agent 查询的数据源；
- 媒体存储；
- 全文或向量搜索引擎；
- 多用户权限数据库。

### 2. 云端数据库作为 Canonical Source of Truth

第一阶段推荐：

```text
PostgreSQL
├── users
├── devices
├── moments
├── moment_assets
├── moment_revisions
├── sync_cursors
├── oauth_grants
├── agent_connections
├── pending_confirmations
└── audit_events
```

搜索优先使用：

```text
PostgreSQL structured filters
+ PostgreSQL full-text search
+ pgvector
```

早期不单独引入独立向量数据库，避免增加一致性和运维复杂度。

### 3. 媒体进入对象存储

图片、音频和视频不写入 `wx` Storage、PostgreSQL 大字段或 MCP JSON。

```text
Client -> Upload Intent -> Object Storage
Client -> Moment API with assetId
```

数据库只保存 Asset Metadata 和引用关系。

### 4. MCP 是 Agent Access Layer，不是数据库

```text
Agent
  -> Moment MCP Server
  -> Auth / Scope / Policy
  -> Moment Domain Service
  -> Repository
  -> PostgreSQL / Object Storage / Search
```

MCP Tool 不直接执行 SQL，不暴露数据库表，也不接受任意 `userId`。

### 5. 传统客户端不强制通过 MCP

```text
Mobile/Web -> App API -> Moment Domain Service
Agent      -> MCP API -> Moment Domain Service
```

App API 与 MCP Server 共用同一领域服务和 Repository。

### 6. Moment One 同时是 MCP Provider 和 Consumer

Provider：

```text
Other Agents -> Moment MCP Server -> User Moments
```

Consumer：

```text
Moment One -> Authorized External MCP Servers
```

两条链路必须分开配置、授权和审计。

## 推荐部署边界

MVP 可先使用模块化单体：

```text
Moment Backend
├── HTTP App API
├── MCP Streamable HTTP Endpoint
├── Moment Domain Service
├── PostgreSQL Repository
├── Media Service
├── Search Service
├── Sync Service
└── Audit Service
```

不需要立即拆成微服务，但代码依赖方向必须保持：

```text
Transport -> Domain -> Repository
```

禁止：

```text
MCP Tool -> SQL
Mobile Handler -> 独立业务规则
AIUI Page -> Cloud Database
```

## MCP 第一阶段范围

先提供只读远程 MCP：

```text
moments_search
moments_list
moments_get
moments_count
reviews_daily
```

完成以下基础后再开放写入：

- OAuth；
- Scope；
- 审计；
- Idempotency；
- Revision；
- 两阶段删除确认；
- 限流；
- 数据导出和撤销授权。

## 对当前代码的影响

当前：

```text
services/memory-store.js
```

后续演进为：

```text
MomentRepository interface
├── LocalMomentRepository
├── CloudMomentRepository
└── SyncingMomentRepository
```

页面和 Tool Executor 只依赖 Repository 接口，不直接依赖 `wx` 或网络协议。

## 结果

优点：

- 眼镜仍支持离线；
- 其他 Agent 可查询已同步的云端 Moment；
- 手机和 Web 使用适合传统软件的 API；
- MCP 和 App API 不会产生两套业务规则；
- 媒体、搜索、权限和审计有清晰边界。

代价：

- 需要建设云端身份、数据库、媒体和同步；
- 离线冲突与 Tombstone 需要额外设计；
- Agent 查询只能看到已同步数据；
- 需要维护 App API 和 MCP 两种传输适配层。
