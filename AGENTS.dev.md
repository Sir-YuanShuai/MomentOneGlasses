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

参考：AIUI 官方文档 `0-guide/bundle/aix.md` — "每个 AIX 包在打包时都会自动生成一个唯一的 UUID `VERSION` 文件，用于版本校验和热更新。"

## MVP 边界

当前 MVP 已接入**设备扫码绑定代码路径**（通过 OAuth 2.1 QR Binding grant 换取 JWT），但只有完成官方模拟器和 Rokid 真机验收后才能标记为已验证。

**已进入运行时（本阶段实现，待真机验收）**：

- **MCP Apps（远程 MCP 客户端）**：`services/mcp-client.js`（手写 JSON-RPC 2.0）+ 记账结果卡片
  `pages/cards/mcp-summary.ink` + 全屏详情页 `pages/mcp/detail.ink`，复用 QR Binding token 认证。
  开发计划与验证记录见 `docs/roadmap/MCP_APPS_ADAPTATION.md`。

**不进入 AIX Runtime，只在 `docs/` 维护设计**：

- Cloud Sync（云端同步）
- 远程 MCP Server 的宿主端能力（SSE 流式、工具动态声明给 LanguageModel、本地缓存/离线降级）

修改代码时，不要为这些能力添加运行时实现。相关设计文档可更新，但不要在 `services/` 或 `pages/` 中引入对应逻辑。

> **设备绑定**是 MVP 已接入、待真机验收的能力：眼镜端扫码 → POST /oauth/token (grant_type=urn:momentone:oauth:grant-type:qr-binding) → 获取 access_token + refresh_token → 本地持久化 → 后续业务请求带 Bearer token。

## 代码结构约定

- **页面**：统一使用单文件 `.ink` 模式，每个页面一个目录（`pages/<name>/<name>.ink`）
- **AIUI 限制**：只使用 AIUI 已确认的组件、事件、API 和 WXSS 属性
- **主题**：优先使用 AIUI 主题 token
- **存储**：使用 `wx` 本地存储（`wx.getStorageSync` / `wx.setStorageSync`）持久化 device_id、binding_id、access_token、refresh_token、access_token 过期时间
- **基础设施**：
  - `services/controls.js`：按键映射，页面交互基础
  - `services/config.js`：Server 地址、OAuth 端点、存储 key 常量
  - `services/binding.js`：设备绑定服务（deviceId 管理、绑定状态、请求绑定、token 刷新、清除绑定、二维码解析）
  - `services/mcp-client.js`：轻量 MCP 客户端（手写 JSON-RPC 2.0，复用 QR Binding token，401 刷新重试）
  - `services/image-decode.js`：AIX 内置的 PNG/JPEG → RGBA 解码器（由打包脚本生成）
  - `services/qr-fallback.js`：本地 QR 像素解码兜底（由打包脚本生成）

AIUI 官方相机链路是 `wx.createCameraContext().takePhoto()` 返回一次照片的 `ArrayBuffer`，没有已确认的实时视频扫码 API，也不依赖云端识别。由于不同宿主的 Canvas/Barcode 构造器注册不一致，发布代码不加载 `barcode` / `canvas` 模块；扫码页在 `onReady()` 后创建相机上下文，将照片解码为 RGBA 后交给 AIX 内置 QR 解码器。

## 当前页面结构

```
pages/index/index.ink       # 唯一入口；未绑定时显示绑定门，已绑定时进入 Moment 对话
pages/scan/scan.ink         # 扫码绑定页，自动打开相机扫码 → 调 requestBinding 换 token
pages/cards/mcp-summary.ink # MCP Apps 记账结果卡片（总结置顶 + 查看详情）
pages/mcp/detail.ink        # MCP Apps 全屏可滚动详情页（chart + 明细 + 操作按钮）
```

## 设备绑定流程

1. **index 页（唯一入口）**：调用 `getBindingStatus()` / `getValidAccessToken()`
   - `bound` → 直接显示 Moment 对话入口
   - `expired` → 尝试 `tryRefresh()`，成功显示 Moment 入口，失败停留绑定门
   - `unbound` → 显示绑定门，按确认键进入 scan
2. **scan 页**：扫码 → `parseQrPayload(value)` 提取 binding_code → `requestBinding(code)` 换 token
   - 成功 → 返回 index，index 读取新 token 后显示 Moment 入口
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
- 禁止在 MVP 阶段引入 Cloud Sync、远程 MCP Server 的宿主端能力（SSE 流式、工具动态声明给 LanguageModel、本地缓存/离线降级）
- 禁止跳过 `npm run verify:mvp` 直接提交
- 禁止提交超过 10MB 的 `.aix` 包
- 禁止修改后不打包 `.aix` 就结束任务
- 禁止在页面中直接操作 `wx.request`，网络请求必须通过 `services/binding.js` / `services/mcp-client.js` 封装
