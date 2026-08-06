# 眼镜端 MCP Apps 适配开发计划

> 文档状态：**Draft 0.2（已实现，待真机验收）** | 更新日期：2026-08-06
> **实现状态（2026-08-06）**：眼镜端 MCP 客户端三能力已实现并通过端到端验证
> （发现 / 执行 / UI 渲染，验证报告见 §12）；待 Rokid 真机 UI 验收。
> 适用范围：MomentOneGlasses（Rokid AIUI / JS）
> 前置条件：Server MCP Server 已交付（Streamable HTTP + OAuth + bookkeeping 工具 + MCP Apps UI）

## 1. 背景与目标

### 1.1 背景

- Server 已完成 MCP Apps 第一版：MCP Server（Streamable HTTP + OAuth + 记账读写工具）+ MCP Apps UI（bookkeeping 资源）；
- 本计划让**眼镜端作为 MCP 客户端**接入同一 MCP Server，验证端到端链路。

### 1.2 定位原则

> **眼镜端只需适配 MCP 即可**——业务功能（记账、统计等）都由服务端完成，眼镜端只负责：
> 发现工具 → 执行工具 → 渲染结果。本地能力（语音、拍照等）**本阶段不管**。

### 1.3 本阶段验证的 3 个基本能力

| # | 能力 | 含义 |
|---|---|---|
| 1 | **MCP 发现** | 眼镜端调 `tools/list` 获取 Server 的工具清单（名称/描述/inputSchema） |
| 2 | **MCP 工具执行** | 眼镜端调 `tools/call` 执行记账读写（`bookkeeping_create` / `bookkeeping_summary`） |
| 3 | **MCP Apps UI 渲染** | 工具返回的 `structuredContent` 以「对话流卡片 + 可进入的全屏滚动页」形态展示（总结置顶 + 细节滚动 + 按钮交互） |

### 1.4 交互形态（用户确认）

> 术语对齐（官方 ROKID.js AIUI）：**沉浸式界面交互（Immersive UI）** = 独立全屏界面承载
> 完整交互（如 index 主页面对话）；**对话内交互（In-Conversation UI）** = 卡片/表单直接嵌入
> 聊天流（由宿主 Tool Rendering 渲染）。下文「对话流卡片」均指对话内交互。

```text
主页面（index）对话（沉浸式界面，index 全屏页）
  → 触发 MCP 工具调用（如"这个月花了多少"）
  → 结果以对话流卡片弹出（总结置顶，占满屏幕不超出）
  → 用户点击卡片/按钮 → 进入全屏滚动页（上下翻动查看细节）
  → 页面内有按钮可触发动作（确认、重新查询等）
```

- **不在 index 沉浸式对话内直接执行 MCP**（避免语音流中断）；工具结果以卡片形式
  出现在对话流，需要深看时点击进入全屏页；
- 卡片大小适中，占满屏幕即可（448×352 约束内），总结放最上、细节放下面。

> 说明：对话流卡片的出现依赖**宿主 Tool Rendering**（宿主 Agent 按 card descriptor
> 协议在聊天流中渲染）。App 侧返回 `{ route, data }` 卡片描述符（card-presenter），
> 并以全屏卡片页导航（navigateTo）作为 fallback；宿主不支持渲染时表现为
> 文本回复或跳转全屏页（见 §12.9）。

## 2. 交互能力确认（基于现有代码证据）

**结论：点击进入 + 按钮触发均已验证可行**，依据项目现有 `pages/cards/account-unbind.ink`（对话流卡片）：

| 能力 | 实现 | 证据 |
|---|---|---|
| 卡片内按钮触发逻辑 | `<button bindtap="confirmUnbind">` + async 方法 + `setData` 更新 | account-unbind 完整先例（含调 Server API） |
| 硬件键交互 | `onKeyUp`（Enter/Backspace/方向键）+ `event.preventDefault()` | account-unbind 先例 |
| 页面导航 | `wx.navigateBack` / `wx.redirectTo`（navigateTo 同族） | account-unbind 先例 |
| 上下翻动 | `<scroll-view>` 组件 | skill §3.3 内置组件 |
| 图表渲染 | `<chart>` 组件（Line/Pie/Area/Radar） | skill §3.3 内置组件 |
| 结构化输入 | 页面 `schema.data`（JSON Schema 声明） | skill §1.4；account-unbind schema 先例 |
| 状态机渲染 | `ink:if` / 数据绑定 | account-unbind 先例 |

> 注意：**直接渲染 Server 的 ext-apps HTML/iframe 不可行**（AIUI 无 app-bridge）；
> 本方案用 AIUI 原生组件渲染**同一份 structuredContent**（数据同源，UI 按 AIUI 实现）。

## 3. 架构

```text
眼镜端（Rokid AIUI / JS）
├── services/mcp-client.js（新增，轻量 MCP Client，手写 JSON-RPC）
│     ├── JSON-RPC 2.0 over Streamable HTTP（wx.request 封装）
│     ├── initialize 握手 → tools/list（发现）→ tools/call（执行）
│     └── Bearer 认证：复用 binding.js 的 QR Binding token（401 时刷新重试）
├── pages/cards/mcp-summary.ink（新增，对话流结果卡片）
│     └── 总结置顶（收入/支出/结余数字）+ 「查看详情」按钮
├── pages/mcp/detail.ink（新增，全屏可滚动详情页）
│     └── scroll-view：<chart> 趋势/占比 + 记录明细列表 + 操作按钮
└── 复用现有：binding.js（token）、config.js（端点配置）、card-presenter.js（卡片呈现）

Moment MCP Server（已有）
├── POST /mcp（Streamable HTTP）
└── 验证 Bearer Token（Web PKCE / 眼镜 QR Binding 同一套验证）
```

## 4. 三个验证能力的实现设计

### 4.1 MCP 发现（tools/list）

```text
POST /mcp  (Authorization: Bearer <access_token>)
→ initialize { protocolVersion, capabilities: {}, clientInfo }
→ notifications/initialized
→ tools/list
← { tools: [ { name: "bookkeeping_create", description, inputSchema }, ... ] }
```

- 拿到工具清单后与本地 `LanguageModel.tools` 声明的格式对齐（为后续动态声明打基础）；
- 本阶段验证目标：能列出 Server 全部工具。

### 4.2 MCP 工具执行（tools/call）

主验证两个工具（读写各一）：

```text
写：tools/call bookkeeping_create
    arguments: { amount: 38.5, flow: "expense", account: "微信", category: "餐饮", occurredAt: "..." }
    ← structuredContent: { moment: { id, type: "bookkeeping", payload, revision } }

读：tools/call bookkeeping_summary
    arguments: { period: "month" }
    ← structuredContent: { income, expense, balance, count, byCategory: [...] }
```

- 非法 payload 应返回 `INVALID_ARGUMENTS`（验证与 Server 校验链路打通）；
- 写操作带 `idempotencyKey`。

### 4.3 MCP Apps UI 渲染（两级：卡片 + 全屏页）

**Level 1 对话流卡片 `pages/cards/mcp-summary.ink`**（总结置顶）：

```text
[记账统计 · 本月]        ← eyebrow + 状态
本月支出 ¥2,318 / 收入 ¥1,200 / 结余 -¥1,118   ← 总结（最上方）
[查看详情]              ← 按钮 → wx.navigateTo 全屏详情页
```

- 卡片大小适中，占满屏幕即可（448×352 约束内），不超出；
- 按钮触发：进入详情页（或直接触发一次动作）。

**Level 2 全屏滚动页 `pages/mcp/detail.ink`**：

```text
<scroll-view>（上下翻动）
├── 顶部：总结块（数字卡）
├── 中部：<chart> 支出分类占比（Pie）+ 近 6 月趋势（Line）
└── 底部：明细列表（bookkeeping_list 逐条卡片）+ 操作按钮（如「记一笔」→ 再次调用）
```

- `schema.data` 声明输入契约（与 structuredContent 对齐）；
- 按钮触发：可再次调用工具、返回卡片等。

### 4.4 数据契约对齐

```text
bookkeeping_summary 输出（Server/MCP/Web 同源）
  → 眼镜端页面 schema.data（AIUI JSON Schema 声明）
  → <chart> 数据格式转换（Line/Pie 的 data 结构，按 components.md 对齐）
```

- 数据口径与 Web 记账板块/MCP Apps 一致，不做本地二次聚合。

## 5. 技术要点

| 项 | 方案 |
|---|---|
| MCP 协议实现 | **手写 JSON-RPC 2.0**（initialize/tools/list/tools/call），不引入完整 SDK——控制 AIX 体积（≤10MB） |
| 传输 | Streamable HTTP，`wx.request` 封装（复用 binding.js 的 request 模式）；**非流式响应**（不处理 SSE） |
| 认证 | 复用 `binding.js` 的 QR Binding token；401 时刷新后重试一次 |
| 端点配置 | `services/config.js` 增加 `MCP_ENDPOINT_URL = SERVER_BASE_URL + '/mcp'` |
| 页面 | `.ink` SFC，448×352 单绿屏，`var(--color-*)` / chart tokens |
| 体积 | 手写 JSON-RPC（约 200~300 行），无新增依赖 |

## 6. 范围

### 6.1 做

- `services/mcp-client.js`：JSON-RPC 封装 + 认证（发现/执行/错误处理）；
- `pages/cards/mcp-summary.ink`：对话流结果卡片（总结置顶 + 查看详情按钮）；
- `pages/mcp/detail.ink`：全屏可滚动详情页（chart + 明细列表 + 操作按钮）；
- `services/config.js`：MCP 端点配置；`card-presenter.js`：卡片创建函数；
- 数据契约对齐（bookkeeping_summary → schema.data → chart）。

### 6.2 不做（本阶段）

- 本地能力：语音、拍照、本地 QR 识别、本地 Moment CRUD 改造——**全都不动**；
- bookkeeping 之外的业务工具（habit 等）；
- SSE 流式响应、工具动态声明给 LanguageModel（发现→执行链路先跑通，动态声明是后续）；
- 本地缓存/离线降级。

## 7. 开发步骤与工作量

| Step | 内容 | 估时 |
|---|---|---|
| 0 | **前置验证**：眼镜端网络可达 `POST /mcp`；QR Binding token 被 MCP 端点接受（需 Server 确认） | 0.5 天 |
| 1 | `services/mcp-client.js`：JSON-RPC（initialize/tools/list/tools/call）+ 认证 + 401 刷新重试 | 1 天 |
| 2 | MCP 发现验证：工具清单拿到并打印/展示 | 0.5 天 |
| 3 | MCP 工具执行验证：`bookkeeping_create` 调通（含非法 payload 错误链路） | 0.5 天 |
| 4 | **UI 渲染验证**：`bookkeeping_summary` → mcp-summary 卡片（总结置顶）+ detail 全屏页（chart + 明细 + 按钮） | 1.5~2 天 |
| 5 | 卡片按钮交互（进入详情页/触发动作）+ 数据契约对齐收尾 + 联调 | 1 天 |
| **合计** | | **~5 天** |

## 8. 风险与前置依赖

| # | 风险/依赖 | 说明/缓解 |
|---|---|---|
| R1 | **AIUI 网络能力边界**（HTTPS 长响应、JSON-RPC body） | Step 0 先验证；`networkTimeout.request=60000` 已配置 |
| R2 | **MCP Server 端点接受 QR Binding token** | Server 侧确认（设计上"只验证 Token"，需实测） |
| R3 | `<chart>` 数据格式与 summary 输出转换 | 按 skill `components.md` 对齐，真机验证 |
| R4 | `wx.navigateTo` 可用性（全屏页导航） | account-unbind 已用 navigateBack/redirectTo，navigateTo 同族；真机验证 |
| R5 | QuickJS 语法兼容 | JSON-RPC 保持 ES 保守语法（与现有 services 一致） |
| R6 | AIX 体积 | 手写轻量实现，无新增依赖；`verify:mvp` 校验 ≤10MB |
| R7 | 对话流卡片尺寸与沉浸式约束 | 卡片占满屏幕即可（448×352），总结置顶、细节可进全屏 |

## 9. 待确认事项（T）

| # | 事项 | 建议 |
|---|---|---|
| T-1 | MCP 端点地址 | `https://moment-one-api.yuanshuai.fun/mcp`（与 Server 一致） |
| T-2 | 卡片入口触发方式 | index 对话流中工具结果以卡片弹出（复用 card-presenter 模式）；本阶段先用固定示例数据/入口验证 |
| T-3 | chart 数据格式 | 按 `components.md` 的 chart 契约（Line/Pie data 结构）实现转换层 |
| T-4 | 工具范围 | bookkeeping 三工具（create/list/summary）足够；habit 后续按需 |
| T-5 | 是否输出工具动态声明给 LanguageModel | 本阶段不做；发现链路验证后作为后续项评估 |

## 10. 验收标准

- [x] Step 0：眼镜端能访问 `POST /mcp`，QR Binding token 认证通过（401 链路验证）
      —— 生产端点 401 + WWW-Authenticate 实测；QR Binding token 由本地 standalone server + Server 测试套件验证
- [x] MCP 发现：眼镜端拿到 Server 工具清单（名称/描述/参数）—— 见 §12 S1
- [x] MCP 工具执行：`bookkeeping_create` 写入成功并在 Server 查回；非法 payload 返回 `INVALID_ARGUMENTS` —— 见 §12 S2/S3
- [x] MCP Apps UI 渲染：summary 数据 → 对话流卡片（总结置顶）→ 点击进入全屏页（chart 正常渲染 + 明细列表 + 按钮可触发动作）
      —— 页面与数据契约已实现；chart 渲染与 navigateTo 真机表现待 Rokid 真机验收（R3/R4）
- [x] `npm run verify:mvp` 通过（AIX 体积 ≤ 10MB）

## 11. 相关文档

- [Server MCP Apps 第一版规划](../../../docs/roadmap/MCP_APPS_PLAN.md)（工具契约、认证设计）
- [MCP Server 契约](../../../docs/contracts/MCP_SERVER.md)（JSON-RPC 工具、错误模型）
- [眼镜端 MCP Apps 架构](../architecture/MCP_APP_ARCHITECTURE.md)（双通道返回、安全要求）
- [AIUI Developer Guide](https://github.com/user-attachments/aiui-dev)（页面 schema.data、chart/scroll-view/button 组件、设计规范）——本地参考 `~/.claude/skills/aiui-dev/`
- [AIX 打包约束](../delivery/AIX_PACKAGING.md)（≤10MB）
- [设备绑定与 Token 契约](../../../MomentOneServer/docs/domain/DEVICE_BINDING.md)（QR Binding token）
- 交互能力先例：`pages/cards/account-unbind.ink`（按钮/硬件键/导航/状态机）
- 端到端验证工具：`dev/mcp-verify/`（README 见 `dev/mcp-verify/README.md`）与
  `MomentOneServer/tests/api/standalone_mcp_server.py`

## 12. 实现与验证记录（2026-08-06）

### 12.1 改动文件

| 文件 | 说明 |
|---|---|
| `services/mcp-client.js` | 新增：手写 JSON-RPC 2.0 over Streamable HTTP（initialize/notifications/tools-list/tools-call），Bearer 认证 + 401 刷新重试，会话复用与过期重建，错误码逐层透传 |
| `services/config.js` | 新增 `MCP_ENDPOINT_URL` / `MCP_PROTOCOL_VERSION` / `MCP_REQUEST_TIMEOUT_MS` |
| `services/card-presenter.js` | 新增 `createMcpSummaryCard`（summary structuredContent → 卡片数据） |
| `services/format.js` | 新增 `formatAmount` / `formatMoney` / `formatPeriodLabel` |
| `services/intent-router.js` | 新增 `mcp.bookkeeping.summary` 规则意图（记账/收支统计措辞） |
| `pages/index/index.ink` | 新增 `presentMcpSummary()` 入口（复用 card-presenter 模式） |
| `pages/cards/mcp-summary.ink` | 新增：对话流结果卡片（总结置顶 + 查看详情按钮 + 错误/重试态） |
| `pages/mcp/detail.ink` | 新增：全屏可滚动详情页（scroll-view + Pie/Line chart + 明细 + 记一笔/重新统计按钮） |
| `app.json` / `app.js` | 注册新路由；MCP 运行时开关置 true |
| `tests/mvp.test.mjs` | 页面清单断言、交互页豁免、意图用例、app.js 开关 |
| `dev/mcp-verify/` | 新增：Node 端到端验证工具（wx shim + loader + 场景脚本） |
| `MomentOneServer/tests/api/standalone_mcp_server.py` | 新增：本地 standalone MCP Server（fake repos，无真实 DB） |

### 12.2 端到端验证结果（真实客户端代码 vs 本地 standalone Server）

| # | 场景 | 结果 |
|---|---|---|
| S1 | `tools/list` 发现：4 工具 + inputSchema | PASS |
| S2 | `bookkeeping_create` 合法 payload 写入 | PASS |
| S3 | 非法 payload（occurredAt / period）→ `INVALID_ARGUMENTS` | PASS |
| S4 | `bookkeeping_summary` 聚合口径（income/expense/balance/count/byCategory） | PASS |
| S5 | `bookkeeping_list` 明细查回 | PASS |
| S6 | 401 → 刷新 → 重试一次 | PASS |
| S7 | 会话过期（404）→ 重建会话重试 | PASS |
| S8 | 未知工具 → 工具级错误透传 | PASS |
| S9 | 绑定 token 刷新后仍有效 | PASS |

复跑：先启动 standalone server，再 `MCP_VERIFY_TOKEN=<token> node --import ./dev/mcp-verify/register.mjs ./dev/mcp-verify/verify.mjs`。

### 12.3 关键实现说明

- 协议版本 `2025-06-18`；请求头 `Accept: application/json, text/event-stream` + `MCP-Protocol-Version`；
  会话 id 从 initialize 响应头 `mcp-session-id` 获取并复用；非流式响应（单对象或数组均可解析）。
- 错误分层：网络（MCP_NETWORK_ERROR）→ HTTP（MCP_HTTP_ERROR）→ JSON-RPC（MCP_RPC_ERROR）→
  工具级（INVALID_ARGUMENTS / SCOPE_DENIED 等透传）。SDK 参数校验失败（isError 但无 structuredContent）
  按文本降级映射为 INVALID_ARGUMENTS。
- 数据契约：`bookkeeping_summary` structuredContent 直接映射卡片/页面数据；Pie 数据 = `byCategory`，
  Line 趋势 = 近 6 期 summary 服务端聚合（不做本地二次聚合）。
- 本阶段不做：SSE 流式、工具动态声明给 LanguageModel、本地缓存/离线降级、bookkeeping 之外的工具。

### 12.4 遗留待真机验收

- `<chart>` 数据格式（series/data 结构）真机渲染确认（R3）
- `wx.navigateTo` 进入详情页真机表现（R4，已内置 redirectTo 兜底）
- 对话流卡片 448×352 尺寸与沉浸式约束（R7）
- 方向键滚动 scroll-view 的宿主行为确认

### 12.5 权限修复记录（2026-08-06）：设备权限 MCP 式管理

**现象**：问账单返回「当前账号缺少记账权限」（SCOPE_DENIED）。

**根因**：scope 命名跨端不一致——早期 Web 绑定对话框与 DEVICE_BINDING.md 用冒号
（`moments:read`），MCP 工具校验用点号（`moments.read`）。历史绑定签发的 token
带冒号 scope → `has_scope("moments.read")` 判定失败。

**修复（对齐 MCP 授权模型，只管理读写权限）**：

1. `app/modules/mcp/scope.py`：新增 `normalize_scope_names()`，历史冒号命名 → 点号；
2. `token_verifier.py`：眼镜 token **以 `device_bindings.scope` 记录为权限事实源**
   （同 `mcp_authorizations` 模型）——Web 端调 PATCH 调整权限后下一次调用即实时生效，
   无需重新扫码；存量冒号绑定自动兼容（**用户无需重绑**）；
3. `devices/service.py`：创建/完成绑定/刷新/改权限各处 scope 规范化，刷新以绑定记录重签；
4. 迁移 `0015_normalize_device_scope`：回填存量冒号数据；
5. Web：绑定对话框默认 scope 改点号；设备列表新增读写权限开关（保存调 PATCH）；
6. Glasses：SCOPE_DENIED 文案改为引导到 Web 端设备管理开启。

**验证**：

- Server 新增单测：冒号 scope 兼容（写读全通）、绑定记录为准（只读绑定下写工具 SCOPE_DENIED）
- 端到端（真实眼镜端客户端 vs standalone server）：`--scope "moments:read moments:write"` 全部 PASS；
  `--scope "moments.read"` 下读工具可用、写工具 SCOPE_DENIED

### 12.6 统一授权模型记录（2026-08-06）：眼镜设备并入 MCP 授权模型

**背景**：眼镜端本质就是 MCP 客户端的一种（特殊设备），此前 `device_bindings` 与
`mcp_authorizations` 是两套平行权限模型，导致 scope 命名漂移等问题。

**统一方案（Server + Web）**：

1. `mcp_authorizations` 增加 `client_type`（mcp / glasses），成为**统一授权记录**
   （权限唯一事实源）；眼镜扫码绑定即创建/更新一条 `client_id=glasses:{device_id}` 的授权；
2. `device_bindings` 只保留设备生命周期（token 管理），`scope` 列降级为 legacy 镜像；
3. token 验证 / 刷新 / 改权限 / 撤销全部以统一授权记录为准（实时生效，无需重绑）；
4. 迁移 0016 回填存量设备为 glasses 授权；存量无授权记录时回退 device_bindings.scope；
5. Web 设置页「设备管理」+「MCP 授权」两个 Tab **合并为「授权与设备」一个列表**：
   眼镜设备与 MCP 客户端同款权限开关（读写），「删除设备」即撤销授权；
   `device-list.tsx` 与独立设备 hooks 删除，复用统一授权列表；
6. 眼镜端无需改动（本来就是 MCP 客户端，复用 binding.js token + mcp-client.js）。

**验证**：Server 单测（授权记录为事实源 / 存量回退）+ 全量 150 passed；
眼镜端 e2e 10 场景全部 PASS；Web tsc/eslint/build 通过。

### 12.7 远程工具与提示词记录（2026-08-06）：动态声明 + 远程记账提示词

**背景**：记账/查账话术此前由本地规则与本地 moment 流程处理（导致「上个月/具体订单
不触发正确参数」「记账显示成功但后端无记录」）。用户要求工具与提示词均由远程提供。

**实现**：

1. **Server**：注册 MCP 提示词 `bookkeeping-assistant`（prompts/list + prompts/get，
   内容为记账指令与相对周期换算规则，存于 `app/modules/mcp/prompts/`）；
2. **眼镜端**：
   - `services/mcp-client.js` 增加 `listPrompts()` / `getPrompt()`；
   - `services/mcp-tools.js`：tools/list → LanguageModel 工具定义（动态声明）；
   - `services/agent-loop.js`：每次规划前拉取远程工具 + 提示词，拼入系统提示词
     （含当前时间注入）；LLM 选中的 MCP 工具由 agent-loop 直接执行
     `mcp-client.callTool` 并返回 `mcp.tool.result` 意图；
   - `pages/index/index.ink`：`mcp.tool.result` 路由 —— bookkeeping_summary →
     统计卡片（复用现有 UI）；bookkeeping_create → 记账成功（含时间/金额）；
     bookkeeping_list → 明细条数；失败 → 错误码提示；
   - `intent-router.js` 离线兜底增强：支持「上月/去年/某月/某年」周期换算。
3. **工具与提示词均为远程**：眼镜端只做客户端适配，不内置记账规则。

**验证**：Server 151 tests（含 prompts 单测）；眼镜端 e2e 新增 S10（prompts）/
S11（动态工具声明）全部 PASS；Web 绑定回调修复（时间戳判定覆盖重绑场景）。

### 12.8 记账预路由记录（2026-08-06）：bookkeeping_plan 远程确定性解析

**问题复现**：①「上个月花了多少」仍查本月 —— LLM 参数不可靠（或设备旧包无上月解析）；
②「记一笔」显示成功但后端无记录 —— 记账话术被本地 moment 流程接管，未走 MCP。

**链路梳理结论**：工具/提示词已远程化，但「意图→参数」仍依赖设备 LLM 质量；
且 Web 开发环境 `.env` 指向 `localhost:8000`，与眼镜端生产服务器不同库
（环境不一致会放大「查不到」问题，需用户确认线上 Web）。

**方案（解析也远程化，眼镜端只做极窄门槛判断）**：

1. **Server 新增 MCP 工具 `bookkeeping_plan(input)`**（确定性规则）：
   - 「上月/某月/某年/今年/去年/上季度」→ action=summary + 精确 year/month；
   - 「记一笔/花了 xx 元/消费 xx/打车 xx」→ action=create + 金额/流向/分类/occurredAt/idempotencyKey；
   - 「明细/账单/流水」→ action=list；无法识别 → action=none + reply 话术；
2. **眼镜端 agent-loop 预路由**：话术过极窄记账门槛（`记账|记一笔|花了|消费|收支|账单…`）
   后直接调 `bookkeeping_plan` → 按 action 执行对应远程工具 → 复用现有卡片/结果 UI；
   plan=none 或失败 → 降级 LLM（远程工具+提示词路径保留）；LLM 不可用时用远程 reply；
3. 修复门槛正则遗漏「记一笔」（不含「记账」字面）导致的漏判。

**验证**：Server 152 tests（含 plan 单测）；e2e S12（上月→2026-7 精确参数、记一笔→
create 参数、非记账→none）PASS；整链路 mock-LLM 验证（记账话术不触发 LLM、直接
plan→执行落库，非记账话术正常走 LLM）PASS。

### 12.9 沉浸式 vs 对话内交互（2026-08-06）：术语对齐与平台能力边界

**官方术语**（ROKID.js AIUI quickstart-intro）：

| 官方术语 | 形态 | 谁渲染 | 我们项目对应 |
|---|---|---|---|
| 沉浸式界面交互（Immersive UI） | 独立全屏界面承载完整交互，AI 与用户围绕同一界面协作 | App 自身（navigateTo 打开） | `pages/index/index` 主页面对话、`pages/mcp/detail` 详情页 |
| 对话内交互（In-Conversation UI） | 卡片/表单/工具面板**直接嵌入聊天流**，可点击、选择 | **宿主**（Host Tool Rendering / A2UI）按 card descriptor 渲染 | `pages/cards/mcp-summary` 卡片（descriptor 由 card-presenter 返回） |

**为什么"对话流里没有卡片"**：对话内卡片必须由**宿主**渲染——宿主 Agent 调用工具时
按协议把 card descriptor（`{ route, data }`）或 A2UI 命令流渲染进聊天流。App 侧无法
主动把卡片"塞进"宿主对话流。我们 App 内的对话发生在 index 全屏页（沉浸式界面），
能做的只有：返回 descriptor（已做）+ 全屏卡片页 fallback（已做）。当前宿主未接入
Tool Rendering 时，表现为文本回复或跳转全屏页。

**什么情况用哪种**：

- **对话内卡片**：结果可快速扫读的场景——统计摘要（本月支出/收入/结余）、单条结果、
  确认类提示。眼镜是"快速可扫读"设备，摘要型结果适合留在对话流。
- **沉浸式全屏页**：需要深度交互的场景——滚动明细、图表、按钮操作（记一笔/重新统计）。

两者可流转（官方：conversation-flow card → full-screen page）：卡片看摘要，点进全屏
看细节——即 §1.4 设计的形态。

**要让对话流直接出现卡片，需要**：

1. 宿主（Rokid 对话环境/调试器）支持 Tool Rendering，能渲染我们返回的 card descriptor；
2. 若宿主支持 A2UI，可改用 A2UI 命令流渲染（`<a2ui>` 组件）；
3. 需向 AIUI 官方确认当前版本 Tool Rendering 的接入方式与声明格式（工具返回
   `_meta` / card 字段的约定），确认后由 Server 工具结果或眼镜端工具返回附带卡片描述。

当前可用路径（已验证）：语音入口 → 远程 plan → MCP 执行 → **结果卡片内嵌在
index 对话区**（对话式交互，不跳转；`mcpCard` 内嵌渲染：总结置顶 + 分类 Top3
+ 「查看详情」按钮）→ 点「查看详情」进全屏详情页（对话式 → 沉浸式流转）。
宿主支持 Tool Rendering 后，同一份 card descriptor（`createMcpSummaryCard`）
可直接渲染进宿主聊天流，形态升级为真正的对话内卡片。
