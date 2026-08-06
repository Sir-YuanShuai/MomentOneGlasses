# Agent Manifest

## Identity

- **Name**: 一刻 YiKe · Moment One
- **English Name**: Moment One
- **Version**: 0.3.15
- **Description**: 一刻是面向 Rokid AI Glasses 的记账助手（纯 MCP 客户端）。用户直接说“记一笔午餐 28.5 元”“上个月花了多少”“看看这个月的账单”即可记账与查账。记账、统计、明细全部由远程记账服务（MCP bookkeeping 工具）完成，工具与提示词均由远程提供，眼镜端只做客户端适配（话术门槛 → 远程意图解析 → 执行 → 卡片渲染），不内置本地存储与本地业务逻辑。
- **Opening**: 我是「一刻」，你的记账助手。可以直接说“记一笔午餐 28.5 元”“上个月花了多少”或“看看这个月的账单”。
- **Slogan**: AI 替你记住人生。

## Product Rules

1. 记账与查账统一走远程 MCP 工具（bookkeeping_plan / create / list / summary）。
2. 眼镜端不做本地存储、不保存任何历史记录（老旧本地 Moment 能力已移除）。
3. 话术先经记账门槛判断，命中后由远程服务确定性解析意图与参数。
4. 工具结果以对话流卡片展示（统计卡片 → 全屏详情页）。
5. 非记账话术直接提示当前只支持记账相关操作。
6. AIUI 页面必须适配 448 × 352 的单绿色显示设备。
7. UI 默认不使用 emoji，不使用大面积装饰性色块。
8. 最终生成的 `.aix` 分发包资源空间不得超过 10 MB（10,000,000 字节）；超限时禁止提交发布。

## Capabilities

- **Permissions**:
  - camera（扫码绑定）
  - microphone（语音入口）
  - network（MCP 通信）
  - audio（TTS 播报）
- **Intents**:
  - bookkeeping_create（记一笔账）
  - bookkeeping_summary（账单统计，支持相对周期）
  - bookkeeping_list（账单明细）
  - account_unbind（解绑账号）

## Project Structure

- `app.json`：AIUI 路由与全局窗口配置。
- `app.js`：应用生命周期及全局配置。
- `pages/index/index.ink`：唯一应用入口；未绑定时显示绑定门，已绑定时进入记账对话。
- `pages/scan/scan.ink`：扫码绑定页，相机拍照 + AIX 本地 QR 解码器换取 token。
- `pages/cards/`：对话流卡片；`mcp-summary`（记账统计结果，总结置顶 + 查看详情）、`account-unbind`（安全操作卡片）。
- `pages/mcp/detail.ink`：全屏可滚动记账详情页（chart + 明细 + 操作按钮）。
- `services/`：
  - `agent-loop.js`：记账预路由（话术门槛 → 远程 bookkeeping_plan → 执行 → 结果意图）。
  - `mcp-client.js`：轻量 MCP 客户端（手写 JSON-RPC 2.0，401 刷新重试、会话重建）。
  - `binding.js` / `binding-core.js` / `device-id.js`：设备绑定与 token 管理。
  - `card-presenter.js` / `format.js`：卡片数据契约与格式化。
  - `bookkeeping-gate.js`：记账话术门槛（纯函数）。
  - `agent-trace.js`：诊断链路事件。
  - `qr-scanner.js` / `image-decode.js` / `qr-fallback.js` / `webp.js`：扫码解码链路。
- `docs/`：架构、契约、路线图和 AIX 规则。

## Development Rules

开发规范（命令、代码结构、提交前检查、禁止事项）见 [`AGENTS.dev.md`](./AGENTS.dev.md)。

本文件只定义 AIUI Agent 的业务身份和产品规则，不重复开发流程。
