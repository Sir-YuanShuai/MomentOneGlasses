# 一刻 YiKe · Moment One

**AI 替你记住人生。**

Moment One 是面向 Rokid AI Glasses 的 AI 原生个人生活记忆系统。用户只需说出“记录这一刻”，系统便会结合第一视角画面、语音、时间与地点生成结构化 `Moment`。

## 当前 MVP

- 记录 Moment：语音识别、第一视角拍照、多模态理解、自动摘要、分类和标签。
- Moment Timeline：按时间倒序浏览生活瞬间。
- AI Memory Search：通过语音或常用问题检索个人记忆。
- 离线降级：LanguageModel、摄像头或语音不可用时仍可保存基础 Moment。

## 页面

| Route | 说明 |
|---|---|
| `pages/index/index` | 记录这一刻 |
| `pages/timeline/timeline` | 我的生活时间线 |
| `pages/search/search` | 问问记忆 |

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
│   ├── ARCHITECTURE.md
│   ├── LOCAL_DEVELOPMENT.md
│   ├── MVP_PLAN.md
│   ├── api/openapi.yaml
│   └── database/schema.sql
├── pages/
│   ├── index/index.ink
│   ├── timeline/timeline.ink
│   └── search/search.ink
├── prompts/moment-understanding.md
└── services/
    ├── format.js
    ├── memory-store.js
    └── moment-ai.js
```

## 本地开发与调试

安装依赖并启动 Ink Web 本地预览：

```bash
npm install
npm run check
npm run dev
```

默认预览地址：

```text
http://127.0.0.1:5173/
```

本地调试环境使用 Vite 加载项目文件，并通过 `@yodaos-pkg/ink` 在 448 × 352 Canvas 中运行 AIUI 页面。可以调试页面渲染、路由、状态、键盘事件、本地存储和降级逻辑。

调试工作台同时提供模拟/真实浏览器语音、模拟/真实浏览器照片和可选 LanguageModel 代理。默认使用模拟语音、模拟照片和模型离线降级，无需设备权限即可验证完整记录流程。

构建静态预览产物：

```bash
npm run build:preview
```

详细安装过程、调试方法、能力边界和真机联调清单见 [AIUI 本地开发与调试环境](./docs/LOCAL_DEVELOPMENT.md)。

设备端最终需要验证以下能力：

- `SpeechRecognition`
- `wx.media.createCameraContext()`
- `LanguageModel`（可选，有确定性降级）
- `wx` storage
- Rokid 实体按键与设备生命周期

## 架构文档

- [产品与技术架构](./docs/ARCHITECTURE.md)
- [MVP 开发计划](./docs/MVP_PLAN.md)
- [OpenAPI 契约](./docs/api/openapi.yaml)
- [PostgreSQL + pgvector Schema](./docs/database/schema.sql)
- [Moment Understanding Prompt](./prompts/moment-understanding.md)
