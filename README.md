# 一刻 YiKe · Moment One

**AI 替你记住人生。**

Moment One 眼镜端是面向 Rokid AI Glasses 的**记账助手（纯 MCP 客户端）**：通过语音直接记账与查账，记账、统计、明细全部由远程记账服务（MCP bookkeeping 工具）完成，工具与提示词均由远程提供，眼镜端不内置本地存储与本地业务逻辑（历史本地 Moment 能力已移除）。

## 当前 MVP

- 设备扫码绑定：眼镜端扫描 Web 端二维码，通过 OAuth 2.1 QR Binding grant 向 Server 换取 JWT access_token + refresh_token，本地持久化（仅凭据，不存业务数据）。
- Token 自动刷新：access_token 过期前自动用 refresh_token 刷新；refresh_token 最长 30 天且不滚动，过期、撤销或刷新失败后清除本地绑定并要求重新扫码。
- 记账对话（纯 MCP）：语音入口 → 记账话术门槛 → 远程 `bookkeeping_plan` 确定性解析（上月/某月/某年、记一笔金额/分类）→ 执行远程 `bookkeeping_create` / `bookkeeping_summary` / `bookkeeping_list` → 对话流卡片/全屏详情页展示。
- 统一入口：index 页根据本地绑定状态（bound / unbound / expired）显示记账入口或绑定门。
- 权限管理：Web 端「授权与设备」统一管理眼镜设备读写权限（实时生效，无需重绑）。

## 页面

| Route | 说明 |
|---|---|
| `pages/index/index` | 唯一入口；未绑定时显示绑定门，已绑定时进入记账对话 |
| `pages/scan/scan` | 扫码绑定页，自动打开相机扫码并换取 token |
| `pages/cards/mcp-summary` | MCP 记账统计结果卡片（总结置顶 + 查看详情） |
| `pages/mcp/detail` | MCP 记账详情全屏可滚动页（chart + 明细 + 操作按钮） |
| `pages/cards/account-unbind` | 解绑账号确认卡片 |

## 项目结构

```text
.
├── AGENTS.md
├── AGENTS.dev.md
├── app.js
├── app.json
├── dev/
│   ├── check.mjs
│   ├── host-capabilities.js
│   ├── index.html
│   ├── main.js
│   └── vite.config.js
├── docs/
│   ├── README.md
│   ├── architecture/
│   ├── contracts/
│   ├── security/
│   ├── decisions/
│   ├── roadmap/
│   └── delivery/
├── pages/
│   ├── index/index.ink       # 入口：绑定门 + 记账对话
│   ├── scan/scan.ink         # 扫码绑定
│   ├── cards/                # 对话流卡片（mcp-summary / account-unbind）
│   └── mcp/detail.ink        # 记账详情全屏页
├── services/
│   ├── agent-loop.js         # 记账预路由（bookkeeping_plan → 执行 → 结果意图）
│   ├── bookkeeping-gate.js   # 记账话术门槛（纯函数）
│   ├── mcp-client.js         # 轻量 MCP 客户端（手写 JSON-RPC 2.0）
│   ├── binding.js            # 设备绑定服务（deviceId、绑定状态、token 刷新、二维码解析）
│   ├── binding-core.js       # 绑定纯逻辑（token 响应校验、错误码）
│   ├── config.js             # Server 地址、OAuth/MCP 端点、存储 key
│   ├── card-presenter.js     # 卡片数据契约
│   ├── format.js             # 金额/周期格式化
│   ├── controls.js           # 按键映射
│   ├── device-id.js          # 设备 UUID
│   ├── agent-trace.js        # 诊断链路事件
│   └── qr-scanner.js         # 扫码解码
├── scripts/                  # 打包与校验脚本
├── tests/mvp.test.mjs        # MVP 回归测试
└── dist/                     # .aix 产物
```

## 常用命令

```bash
npm run dev                  # Vite 开发预览
npm run verify:mvp           # 完整验证（check + test:mvp + build:preview）
npm run pack:aix             # 生成 .aix 包
npm run check:aix-size -- <file|dir>  # 校验包体积（< 10MB）
```

详见 [`AGENTS.dev.md`](./AGENTS.dev.md)。

## 相关文档

- [眼镜端 MCP Apps 适配计划](./docs/roadmap/MCP_APPS_ADAPTATION.md)
- [MCP Server 契约（眼镜端视角）](./docs/contracts/MCP_SERVER_CONTRACT.md)
- [设备绑定与 Token 契约](../MomentOneServer/docs/domain/DEVICE_BINDING.md)
- [AIX 打包约束](./docs/delivery/AIX_PACKAGING.md)
