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
├── docs/
│   ├── ARCHITECTURE.md
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

## 运行

使用 AIUI/JSUI Agent 开发环境打开项目，并按照当前宿主工具链完成依赖安装与开发服务器启动。项目本身不引入第三方 npm 依赖。

设备端需要提供以下能力：

- `SpeechRecognition`
- `wx.media.createCameraContext()`
- `LanguageModel`（可选，有确定性降级）
- `wx` storage

## 架构文档

- [产品与技术架构](./docs/ARCHITECTURE.md)
- [MVP 开发计划](./docs/MVP_PLAN.md)
- [OpenAPI 契约](./docs/api/openapi.yaml)
- [PostgreSQL + pgvector Schema](./docs/database/schema.sql)
- [Moment Understanding Prompt](./prompts/moment-understanding.md)
