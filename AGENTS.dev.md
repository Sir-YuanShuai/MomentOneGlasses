# MomentOneGlasses — Agent 开发规范

> 本文件规范 AI Agent 在 `MomentOneGlasses` 仓库中的开发行为。
> 业务身份和 AIUI Manifest 见 `AGENTS.md`，不在本文重复。

## 常用命令

```bash
# 开发
npm run dev                  # 启动 Vite 开发预览
npm run build:preview        # 构建预览产物

# 质量检查
npm run check                # 静态检查
npm run test:mvp             # MVP 测试
npm run verify:mvp           # 完整验证 = check + test:mvp + build:preview

# AIX 打包
npm run pack:aix             # 生成 .aix 包
npm run check:aix-size -- <file|dir>  # 校验包体积（必须 < 10MB）
```

## 提交前检查清单

每次提交前必须运行 `npm run verify:mvp` 并全部通过。

每次生成 `.aix` 后必须运行 `npm run check:aix-size`，只有校验通过的包才可上传。

## 强制规则：每次修改后必须打包 AIX

**每次完成代码修改后，必须运行 `npm run pack:aix` 生成最新的 `.aix` 包。**

这是为了让用户可以立即在官方调试器中加载最新版本测试，无需自己手动打包。验证流程：

```bash
npm run verify:mvp && npm run pack:aix
```

## AIX VERSION 文件约束

AIUI 要求每个 `.aix` 包内必须包含 `VERSION` 文件，内容为**唯一 UUID**（非语义版本号）。

- 设备根据 `VERSION` 判断是否需要更新缓存的页面文件
- 如果 `VERSION` 固定不变，设备会误判"版本未变"而不触发更新，旧页面文件会持续缓存
- `scripts/pack-aix.mjs` 每次打包时通过 `crypto.randomUUID()` 生成新的 UUID 写入 `VERSION`，并将同一 UUID 写入打包 staging 内的 `services/build-info.js`；index 首页据此显示当前 AIX 构建短码
- **禁止**将 `VERSION` 改回固定版本号或可重复值
- 语义版本号（`package.json` version，如 0.3.15）用于文件名/显示/`APP_VERSION`，与 VERSION UUID 解耦

参考：AIUI 官方文档 `0-guide/bundle/aix.md` — "每个 AIX 包在打包时都会自动生成一个唯一的 UUID `VERSION` 文件，用于版本校验和热更新。"

## 产品边界（纯 MCP 记账客户端）

眼镜端**只做 MCP 客户端适配**，无本地业务：

- **做**：设备绑定（扫码 QR Binding）、语音入口、记账预路由（话术门槛 → 远程 `bookkeeping_plan` → 执行远程工具）、结果卡片/全屏详情页渲染。
- **不做**（历史功能已移除，禁止回加）：本地 Moment 存储（`memory-repository` / `memory-store` / `moment-ai`）、本地记录流程（拍照补记/录音）、本地意图规则（`intent-router`）、本地工具声明（`services/tools`、`prompts`）、设备端 LLM 工具规划（`LanguageModel`）。
- 工具定义与提示词均由远程 Server 提供（MCP tools/prompts），眼镜端不内置。

修改代码时，不要为已移除的能力添加运行时实现。

## 代码结构约定

- **页面**：统一使用单文件 `.ink` 模式，每个页面一个目录（`pages/<name>/<name>.ink`）
- **AIUI 限制**：只使用 AIUI 已确认的组件、事件、API 和 WXSS 属性
- **主题**：优先使用 AIUI 主题 token
- **存储**：只使用 `wx` 本地存储保存绑定凭据（device_id、binding_id、access_token、refresh_token、过期时间），**不存业务数据**
- **基础设施**：
  - `services/controls.js`：按键映射，页面交互基础
  - `services/config.js`：Server 地址、OAuth/MCP 端点、存储 key 常量
  - `services/binding.js`：设备绑定服务（deviceId 管理、绑定状态、请求绑定、token 刷新、清除绑定、二维码解析）
  - `services/mcp-client.js`：轻量 MCP 客户端（手写 JSON-RPC 2.0，复用 QR Binding token，401 刷新重试、会话过期重建、prompts）
  - `services/agent-loop.js`：记账预路由（`bookkeeping_plan` → 执行 → 结果意图）
  - `services/bookkeeping-gate.js`：记账话术门槛（纯函数，可单测）
  - `services/image-decode.js`：AIX 内置的 PNG/JPEG → RGBA 解码器（由打包脚本生成）
  - `services/qr-fallback.js`：本地 QR 像素解码兜底（由打包脚本生成）

AIUI 官方相机链路是 `wx.createCameraContext().takePhoto()` 返回一次照片的 `ArrayBuffer`，没有已确认的实时视频扫码 API，也不依赖云端识别。由于不同宿主的 Canvas/Barcode 构造器注册不一致，发布代码不加载 `barcode` / `canvas` 模块；扫码页在 `onReady()` 后创建相机上下文，将照片解码为 RGBA 后交给 AIX 内置 QR 解码器。

## 当前页面结构

```
pages/index/index.ink       # 唯一入口；未绑定时显示绑定门，已绑定时进入记账对话
pages/scan/scan.ink         # 扫码绑定页，自动打开相机扫码 → 调 requestBinding 换 token
pages/cards/mcp-summary.ink # MCP 记账结果卡片（总结置顶 + 查看详情）
pages/mcp/detail.ink        # MCP 全屏可滚动记账详情页（chart + 明细 + 操作按钮）
pages/cards/account-unbind.ink  # 解绑账号确认卡片
```

## 设备绑定流程

1. **index 页（唯一入口）**：调用 `getBindingStatus()` / `getValidAccessToken()`
   - `bound` → 直接显示记账对话入口
   - `expired` → 尝试 `tryRefresh()`，成功显示记账入口，失败停留绑定门
   - `unbound` → 显示绑定门，按确认键进入 scan
2. **scan 页**：扫码 → `parseQrPayload(value)` 提取 binding_code → `requestBinding(code)` 换 token
   - 成功 → 返回 index，index 读取新 token 后显示记账入口
   - 失败 → 显示错误提示，恢复扫码
3. **index 页**：未绑定时不自动跳转，避免入口页面闪烁和路由循环；绑定门由确认键或唤醒进入 scan

## 本地存储 key

定义在 `services/config.js` 的 `STORAGE_KEYS`（冻结对象）：

| key | 含义 |
|---|---|
| `deviceId` | 设备 UUID v4，首次生成持久化 |
| `bindingId` | 绑定关系 UUID |
| `accessToken` | JWT access_token（有效期以 Server 返回的 `expires_in` 为准） |
| `refreshToken` | JWT refresh_token（30 天硬上限，不滚动；过期后重新扫码） |
| `accessTokenExpiresAt` | access_token 过期时间戳（秒） |
| `refreshTokenExpiresAt` | refresh_token 首次绑定起 30 天的本地硬截止时间戳（秒） |

## 禁止事项

- 禁止使用未在 AIUI 文档中确认的组件或 API
- 禁止回加本地 Moment 存储/本地记录/本地意图规则/设备端 LLM 工具规划（已移除的历史能力）
- 禁止跳过 `npm run verify:mvp` 直接提交
- 禁止提交超过 10MB 的 `.aix` 包
- 禁止修改后不打包 `.aix` 就结束任务
- 禁止在页面中直接操作 `wx.request`，网络请求必须通过 `services/binding.js` / `services/mcp-client.js` 封装

## AIUI 网络环境坑（务必先读）

见 `docs/roadmap/MCP_APPS_ADAPTATION.md §12.11` 完整复盘。核心三条：

1. **fetch 是 `/runtime-fetch` 代理，丢失响应头**——依赖响应头的协议（MCP 会话）必须用 `wx.request` 主传输，fetch 仅 fallback；
2. **`response.text()` 会挂起**——必须用 `response.body.getReader() + TextDecoder` 流式读取；`Headers.forEach` 不可用需 `entries/get` 兜底；
3. **宿主调用页面工具会按 schema 编造参数**——调用链必须 **utterance 优先**（宿主传话术就让页面自取真实数据），宿主数据仅兜底。
