# 一刻 YiKe · Moment One

**AI 替你记住人生。**

Moment One 当前 MVP 是面向 Rokid AI Glasses 的纯本地个人记忆应用。跨平台 Memory Platform、Cloud、MCP Server、Mobile/Web 和 MCP Apps 仅保留架构设计，当前版本不连接云端或远程 MCP。

## 当前 MVP

- 记录 Moment：语音识别、第一视角拍照、多模态理解、自动摘要、分类和标签。
- Tool Calling 交互：首页通过 `LanguageModel.tools` 选择新增、查询、回顾、修改、删除或配置工具，并由代码层校验和执行。
- 自然记录：用户直接表达具体生活经历、当下观察或感受即可生成 Moment，不要求先说“记录”；非生活请求和不明确内容不会保存。
- 双形态 UI：沉浸式首页负责连续语音操作，对话流卡片只读展示 Moment 结果、记忆回答和 MCP App 降级结果。
- 本地优先：Moment、配置、查询和确认状态均保存在当前设备，不依赖 Cloud 或 MCP。
- AI Memory Search：在同一页面通过语音检索个人记忆，并只依据用户自己的 Moment 回答。
- 快速记录：开启后先拍照并显示预览，再询问记录内容，最后通过语音选择保存照片、重新拍摄、不保存照片或录制短音频。
- 视频边界：当前已确认的 AIUI Camera API 只支持拍照，视频录制暂不执行，会提示改用照片或录音。
- 本地录音调试：Flight Recorder 使用短时模拟音频跑通保存链路；设备端继续使用 `wx.media.getRecorderManager()`，需真机验证权限与文件路径生命周期。
- 离线降级：LanguageModel、摄像头或语音不可用时仍可保存基础 Moment。

## 页面

| Route | 说明 |
|---|---|
| `pages/index/index` | 单页完成记录、记忆查询、生活回顾和即刻记忆配置 |
| `pages/cards/moment-result` | 只读展示 Moment 操作结果 |
| `pages/cards/memory-answer` | 只读展示记忆回答和证据摘要 |

## 项目结构

```text
.
├── AGENTS.md
├── app.js
├── app.json
├── dev/
│   ├── check.mjs
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
│   ├── welcome/welcome.ink
│   ├── scan/scan.ink
│   └── index/index.ink
└── services/
    └── controls.js
```

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

页面进入后会直接开启统一 STT 意图入口。模拟语音只有在页面真正开启 STT 后才允许输入和发送；发送完成后输入会再次锁定。工作台同时支持浏览器真实语音、模拟/真实照片和模型离线降级。

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

默认产物为 `dist/moment-one-<version>.aix`，包内会生成与 `package.json` 一致的 `VERSION` 文件。打包完成后必须执行：

```bash
npm run check:aix-size -- dist/moment-one-0.1.0.aix
```

也可以传入包含 AIX 包的目录；任意文件超限都会返回非零退出码并阻止发布：

```bash
npm run check:aix-size -- dist
```

完整的资源清单、验证流程、常见错误和发布边界见 [AIX 本地打包与体积校验](./docs/delivery/AIX_PACKAGING.md)。

当前文档入口见 [Moment One 文档索引](./docs/README.md)。本地 Vite 预览是项目自建的浏览器 fallback，不等同于 Rokid Glasses 真机；设备侧能力仍需单独验收。

设备端最终需要验证以下能力：

- `SpeechRecognition`
- `wx.media.createCameraContext()`
- `LanguageModel`（可选，有确定性降级）
- `wx` storage
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

当前应用为页面导航 + 设备绑定流程，对话功能待实现。
