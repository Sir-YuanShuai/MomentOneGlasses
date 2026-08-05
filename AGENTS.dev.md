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
- `scripts/pack-aix.mjs` 每次打包时通过 `crypto.randomUUID()` 生成新的 UUID 写入 `VERSION`
- **禁止**将 `VERSION` 改回固定版本号或可重复值

参考：AIUI 官方文档 `0-guide/bundle/aix.md` — "每个 AIX 包在打包时都会自动生成一个唯一的 UUID `VERSION` 文件，用于版本校验和热更新。"

## MVP 边界

当前 MVP 已接入**设备扫码绑定代码路径**（通过 OAuth 2.1 QR Binding grant 换取 JWT），但只有完成官方模拟器和 Rokid 真机验收后才能标记为已验证，以下能力**不进入 AIX Runtime**，只在 `docs/` 维护设计：

- Cloud Sync（云端同步）
- 远程 MCP（MCP Server 调用）
- MCP Apps（第三方 Agent 入驻）

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

## 当前页面结构

```
pages/welcome/welcome.ink   # 欢迎页（入口），点击/唤醒后根据绑定状态分流
pages/scan/scan.ink         # 扫码绑定页，自动打开相机扫码 → 调 requestBinding 换 token
pages/index/index.ink       # 主页（本地 Moment 对话与工具执行），进入时校验 token
```

## 设备绑定流程

1. **welcome 页**：`getBindingStatus()` 返回 `bound` / `unbound` / `expired`
   - `bound` → 跳转 index
   - `expired` → 尝试 `tryRefresh()`，成功跳 index，失败跳 scan
   - `unbound` → 跳转 scan
2. **scan 页**：扫码 → `parseQrPayload(value)` 提取 binding_code → `requestBinding(code)` 换 token
   - 成功 → 跳转 index
   - 失败 → 显示错误提示，恢复扫码
3. **index 页**：`onLoad` 调 `getValidAccessToken()` 确保 token 可用，不可用则跳 scan

## 本地存储 key

定义在 `services/config.js` 的 `STORAGE_KEYS`（冻结对象）：

| key | 含义 |
|---|---|
| `deviceId` | 设备 UUID v4，首次生成持久化 |
| `bindingId` | 绑定关系 UUID |
| `accessToken` | JWT access_token（有效期以 Server 返回的 `expires_in` 为准） |
| `refreshToken` | JWT refresh_token（30 天硬上限，不滚动；过期后重新扫码） |
| `accessTokenExpiresAt` | access_token 过期时间戳（秒） |

## 禁止事项

- 禁止使用未在 AIUI 文档中确认的组件或 API
- 禁止在 MVP 阶段引入 Cloud Sync、远程 MCP 或 MCP Apps 的运行时代码
- 禁止跳过 `npm run verify:mvp` 直接提交
- 禁止提交超过 10MB 的 `.aix` 包
- 禁止修改后不打包 `.aix` 就结束任务
- 禁止在页面中直接操作 `wx.request`，网络请求必须通过 `services/binding.js` 封装
