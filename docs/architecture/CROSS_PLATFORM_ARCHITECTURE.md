# Moment One 跨平台架构

> 文档状态：Draft 1.0  
> 更新日期：2026-07-30

> 当前版本仅实现纯本地 Rokid AIUI MVP。本文描述后续 Cloud、Mobile/Web、MCP Server 和 MCP Apps 的目标架构。

## 1. 产品定位

Moment One 不再只定义为 Rokid AI Glasses 应用，而是一个跨平台的个人生活记忆基础设施：

> 以 `Moment` 为统一领域模型，通过 App API 服务传统软件，通过 MCP 服务各类 Agent，通过 MCP Apps 提供对话内 UI，通过离线同步支持眼镜和移动设备。

眼镜是第一视角采集端，手机和 Web 是完整管理端，外部 Agent 是智能访问端。

## 2. 核心架构原则

### 2.1 MCP 统一能力，不统一所有传输

MCP 用于统一 Agent 可以发现和调用的能力：

- 查询用户 Moment；
- 获取结构化证据；
- 创建或修改 Moment；
- 请求删除并完成确认；
- 获取每日或每周回顾；
- 展示 MCP Apps UI。

传统手机和 Web 客户端仍通过 REST、GraphQL、WebSocket 和标准文件上传访问后端。它们与 MCP Server 共享同一个领域服务，不重复实现业务规则。

### 2.2 Moment Core 是事实源

系统核心不是某个页面、设备或 Agent Prompt，而是：

- Moment 领域模型；
- 用户身份与权限；
- 媒体资产；
- 搜索和证据；
- 离线同步；
- 审计和隐私。

### 2.3 Agent 理解与业务执行分离

模型负责：

- 选择工具；
- 提取参数；
- 根据 Moment 证据生成回答。

代码负责：

- 校验参数；
- 判断权限；
- 定位 Moment；
- 管理确认；
- 执行增删改查；
- 记录审计；
- 离线降级。

### 2.4 UI 共享 ViewModel，不强制共享运行时

不同平台共享字段、状态和设计 Token，但分别使用合适的 UI 技术：

- Rokid：AIUI `.ink`；
- MCP Apps：HTML/JavaScript UI Resource；
- iOS：SwiftUI；
- Android：Compose；
- Web：Web UI；
- 对话流：只读结果卡片，以及账号解绑等带明确确认的安全 action 卡片。

## 3. 目标系统图

```text
                        Moment One Platform
┌────────────────────────────────────────────────────────────────┐
│                         Moment Core                            │
│                                                                │
│ Identity  Moment Domain  Media  Search  Sync  Audit  Policy   │
└───────────────┬──────────────────────┬─────────────────────────┘
                │                      │
        ┌───────▼────────┐     ┌───────▼──────────┐
        │ App API        │     │ Moment MCP Server│
        │ REST/GraphQL   │     │ Tools/Resources  │
        └───────┬────────┘     └───────┬──────────┘
                │                      │
     ┌──────────┼──────────┐           ├── ChatGPT
     │          │          │           ├── Claude
 Rokid AIUI   Mobile      Web           ├── Codex
                                        └── Other MCP Clients
                                             │
                                         MCP Apps UI
```

## 4. 平台组件

### 4.1 Moment Core

提供与协议无关的领域能力：

```text
MomentService.create
MomentService.search
MomentService.get
MomentService.update
MomentService.deletePreview
MomentService.deleteConfirm
MomentService.generateReview
ConfigService.get
ConfigService.set
```

App API 和 MCP Server 只能调用这些领域服务，不能各自实现一套规则。

### 4.2 App API

面向传统客户端，负责：

- 登录和用户会话；
- 时间线分页；
- Moment 详情；
- 批量查询和编辑；
- 媒体上传和下载；
- 增量同步；
- 推送和设备管理；
- Agent 访问审计。

### 4.2.1 多端授权模型

不同平台使用不同的授权方式，但共享同一套 Moment Core 领域服务：

| 平台 | 授权方式 | 核心机制 |
|---|---|---|
| Web / Mobile | OAuth Authorization Code + PKCE | 浏览器跳转 Casdoor 登录 |
| 眼镜端 | 扫码设备绑定（QR Binding） | Web 端显示二维码，眼镜摄像头扫描建立 **DeviceBinding**（长期绑定关系，可撤销） |
| 外部 Agent | OAuth User Context | 用户在 MCP Client 中授权 |
| 后台服务 | Client Credentials | 服务间机器授权 |

眼镜端授权的核心概念是 **DeviceBinding** 而非"获取 Token"——扫码建立的是眼镜与用户账号之间的长期绑定关系，Token 只是绑定的产物。Token 生命周期：Access Token（短期，有效期以 Server 返回的 `expires_in` 为准）→ Refresh Token（30 天硬上限、不滚动）；Refresh Token 过期或绑定撤销后必须重新扫码。

权威绑定契约见 `MomentOneServer/docs/domain/DEVICE_BINDING.md`；身份边界补充见 `docs/security/IDENTITY_SYNC_SECURITY.md`。

### 4.3 Moment MCP Server

Moment One 同时扮演 MCP Provider 和 MCP Consumer。

作为 Provider：

```text
External Agent -> Moment MCP Server -> Moment Core
```

作为 Consumer：

```text
Moment One -> Authorized External MCP Server
```

外部 MCP 数据默认只作为候选上下文。需要长期保存时，必须经过用户明确确认并转换为带来源信息的 Moment。

### 4.4 Platform Clients

#### Rokid AIUI

负责：

- 第一视角快速记录；
- 语音查询；
- 轻量修改和确认；
- 离线记录；
- 简短语音回答。

#### Mobile / Web

负责：

- 完整时间线；
- 媒体浏览；
- 精细编辑；
- 搜索和过滤；
- 同步冲突处理；
- 授权、隐私和审计。

#### Agent Clients

通过 MCP 获取结构化 Moment 证据。Agent 可以按自己的能力生成回答，但不得获得超出当前用户和 Scope 的数据。

#### MCP Apps

用于在支持的对话 Host 内展示时间线、搜索结果、详情和回顾。Host 不支持 MCP Apps 时，必须保留结构化数据和文本降级。

## 5. 统一领域模型

建议云端 Moment 至少包含：

```ts
interface Moment {
  id: string;
  userId: string;

  title: string;
  description: string;
  voiceInput: string;
  aiSummary: string;

  occurredAt: string;
  timezone: string;

  location: {
    name: string;
    latitude?: number;
    longitude?: number;
    source: 'device' | 'user' | 'mcp' | 'unknown';
  };

  emotion: {
    label: string;
    source: 'user' | 'inferred';
    valence?: number;
    arousal?: number;
  } | null;

  category: 'experience' | 'habit' | 'travel' | 'food' | 'growth' | 'emotion';
  tags: string[];
  media: MomentAsset[];

  provenance: {
    source: 'rokid' | 'mobile' | 'web' | 'agent' | 'mcp' | 'import';
    clientId?: string;
    mcpServerId?: string;
    mcpToolName?: string;
    externalId?: string;
  };

  revision: number;
  syncState?: 'pending' | 'synced' | 'conflict';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

设备端继续使用相同领域模型，只增加本地同步字段，不建立旅行、美食、日记等独立输入模型。

## 6. 关键数据流

### 6.1 眼镜离线记录

```text
Speech / Camera
  -> Local Moment
  -> syncState: pending
  -> Local Outbox
  -> Network Recovered
  -> Upload Media
  -> Sync Moment
  -> Cloud Revision
  -> syncState: synced
```

### 6.2 Agent 查询

```text
Agent
  -> MCP moments_search
  -> OAuth User Context
  -> Moment Core Search
  -> Structured Evidence
  -> Agent Answer / MCP App
```

### 6.3 手机展示

```text
Mobile App
  -> App API
  -> Cursor Timeline
  -> Signed Thumbnails
  -> Local Cache
  -> Native UI
```

### 6.4 MCP 外部数据转 Moment

```text
User Request
  -> External MCP Tool
  -> Candidate Data
  -> User Confirmation
  -> Normalize to Moment
  -> Save Provenance
```

## 7. 推荐代码仓库结构

长期建议迁移为 Monorepo：

```text
moment-one/
├── apps/
│   ├── rokid-aiui/
│   ├── mobile/
│   ├── web/
│   └── mcp-app/
├── services/
│   ├── api/
│   ├── mcp-server/
│   ├── media/
│   └── worker/
├── packages/
│   ├── domain/
│   ├── contracts/
│   ├── tool-definitions/
│   ├── ui-models/
│   ├── auth/
│   ├── search/
│   └── sdk/
└── docs/
```

当前仓库后续可迁移为 `apps/rokid-aiui/`，现有代码继续作为第一方客户端，不需要推翻重写。

## 8. 当前实现与目标映射

| 当前实现 | 长期归属 |
|---|---|
| `services/memory-store.js` | Edge Local Repository |
| `services/agent-loop.js` | Rokid Edge Agent Loop |
| `services/tools/` | Shared Tool Contracts / Edge Policy |
| MCP Consumer Gateway Client | Future / not in local MVP |
| `pages/cards/` | AIUI Conversation Card Adapter |
| `pages/index/index.ink` | Rokid Immersive Client |
| `prompts/` | Versioned Model Instructions |

仍需新增：

- Cloud Moment Repository；
- Syncing Repository；
- App API；
- Moment MCP Server；
- OAuth 和 Scope；
- 媒体服务；
- 审计日志；
- Mobile/Web 客户端；
- 标准 MCP Apps UI Resource。

## 9. 架构决策摘要

1. MCP 是 Agent 接口，不是所有客户端的唯一 API。
2. Moment Core 是唯一业务事实源。
3. 本地设备采用 Offline-First，云端采用 Revision 和 Tombstone。
4. 媒体不通过 MCP JSON 传输。
5. MCP Tool 返回结构化证据，不只返回自然语言答案。
6. 删除和外部副作用采用两阶段确认。
7. 用户身份来自授权 Token，不允许 Tool 参数传入任意 `userId`。
8. MCP Apps 和传统 App 共用 ViewModel，但不强制共用 UI Runtime。
