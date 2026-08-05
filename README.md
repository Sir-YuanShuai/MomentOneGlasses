# 一刻 YiKe · Moment One

**AI 替你记住人生。**

Moment One 当前 MVP 是面向 Rokid AI Glasses 的个人记忆应用，已接入设备扫码绑定代码路径（OAuth 2.1 QR Binding grant，仍需官方模拟器与真机验收）。跨平台 Memory Platform、Cloud Sync、MCP Server、Mobile/Web 和 MCP Apps 仅保留架构设计，当前版本不实现云端同步或远程 MCP。

## 当前 MVP

- 设备扫码绑定：眼镜端扫描 Web 端二维码，通过 OAuth 2.1 QR Binding grant 向 Server 换取 JWT access_token + refresh_token，本地持久化。
- Token 自动刷新：access_token 过期前自动用 refresh_token 刷新；refresh_token 最长 30 天且不滚动，过期、撤销或刷新失败后清除本地绑定并要求重新扫码。
- 统一入口：index 页根据本地绑定状态（bound / unbound / expired）显示 Moment 入口或绑定门，不再经过独立 welcome 页。
- 页面导航与本地对话能力：index 绑定门 → scan → index Moment 入口，保留本地 Moment 记录、查询、修改和删除能力。

## 页面

| Route | 说明 |
|---|---|
| `pages/index/index` | 唯一入口；未绑定时显示绑定门，已绑定时进入本地 Moment 对话 |
| `pages/scan/scan` | 扫码绑定页，自动打开相机扫码并换取 token |

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
│   ├── index/index.ink
│   ├── scan/scan.ink
│   └── cards/
├── services/
│   ├── binding.js      # 设备绑定服务（deviceId、绑定状态、请求绑定、token 刷新、二维码解析）
│   ├── image-decode.js # AIX 内置图片解码器（PNG/JPEG → RGBA）
│   ├── qr-fallback.js  # 本地 QR 像素解码兜底
│   ├── config.js       # Server 地址、OAuth 端点、存储 key 常量
│   └── controls.js     # 按键映射
└── tests/
    └── mvp.test.mjs
```

## 设备绑定流程

1. **Web 端**登录后创建绑定会话，生成二维码（`momentone://bind?code=<URL-safe binding_code>`）
2. **眼镜端**首次进入 index 页 → 未绑定时显示绑定门，按确认键进入 scan 页
3. **scan 页**拍照后先将 PNG/JPEG 解码为 RGBA，再由 AIX 内置 QR 解码器识别 → `parseQrPayload()` 提取 binding_code → `requestBinding(code)` 调 POST /oauth/token 换 token
4. 绑定成功 → 返回 index 页，本地存储 access_token / refresh_token / expires_at
5. 后续进入 index 页时调 `getValidAccessToken()` 确保 token 可用，过期则自动刷新

## 本地开发与调试

安装依赖并启动 Ink Web 本地预览：

```bash
npm install
npm run check
npm run test:mvp
npm run dev
```

默认预览地址：

```text
http://127.0.0.1:5173/
```

本地调试环境使用 Vite 加载项目文件，并通过 `@yodaos-pkg/ink` 在 448 × 352 Canvas 中运行 AIUI 页面。Flight Recorder 工作台提供四键 UI 模拟、语音交互信号轨、摄像头检查器和 LanguageModel 代理状态。

构建静态预览产物：

```bash
npm run build:preview
```

执行本地 MVP 一键验证：

```bash
npm run verify:mvp
```

## AIX 包体积规则

最终生成的 `.aix` 分发包不得超过 **10 MB（10,000,000 字节）**。本地打包：

```bash
npm run pack:aix
```

默认产物为 `dist/moment-one-<version>.aix`，包内会生成唯一 UUID 格式的 `VERSION` 文件，用于避免设备缓存旧页面。打包完成后必须执行：

```bash
npm run check:aix-size -- dist/moment-one-0.3.2.aix
```

也可以传入包含 AIX 包的目录；任意文件超限都会返回非零退出码并阻止发布：

```bash
npm run check:aix-size -- dist
```

完整的资源清单、验证流程、常见错误和发布边界见 [AIX 本地打包与体积校验](./docs/delivery/AIX_PACKAGING.md)。

当前文档入口见 [Moment One 文档索引](./docs/README.md)。本地 Vite 预览是项目自建的浏览器 fallback，不等同于 Rokid Glasses 真机；设备侧能力仍需单独验收。

设备端最终需要验证以下能力：

- `BarcodeDetector`（二维码识别）
- `wx.media.createCameraContext()`（相机拍照）
- `wx.request`（网络请求 OAuth token 端点）
- `crypto.randomUUID()`（设备 ID 生成）
- `wx` storage（token 持久化）
- Rokid 实体按键与设备生命周期

## 架构文档

- [文档索引](./docs/README.md)
- [当前本地 MVP 范围](./docs/mvp/LOCAL_MVP_SCOPE.md)
- [Moment One 跨平台架构](./docs/architecture/CROSS_PLATFORM_ARCHITECTURE.md)
- [Moment One MCP Server 契约](./docs/contracts/MCP_SERVER_CONTRACT.md)
- [MCP 与 MCP Apps 架构](./docs/architecture/MCP_APP_ARCHITECTURE.md)
- [身份、同步与安全](./docs/security/IDENTITY_SYNC_SECURITY.md)
- [跨平台实施路线图](./docs/roadmap/PLATFORM_ROADMAP.md)
- [AIX 本地打包与体积校验](./docs/delivery/AIX_PACKAGING.md)

当前应用包含页面导航、待真机验收的设备绑定流程，以及设备内本地 Moment 对话能力。
