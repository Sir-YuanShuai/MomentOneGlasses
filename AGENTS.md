# Agent Manifest

## Identity

- **Name**: 一刻 YiKe · Moment One
- **English Name**: Moment One
- **Version**: 0.1.0
- **Description**: 面向 Rokid AI Glasses 的 AI 原生个人生活记忆系统，通过第一视角画面与自然语言帮助用户记录和回忆人生瞬间。
- **Slogan**: AI 替你记住人生。

## Product Rules

1. 所有生活数据统一抽象为 `Moment`。
2. 不建立独立的旅行、美食、打卡或日记输入模块。
3. 用户输入最少化，分类、标签和摘要默认由 AI 完成。
4. 第一视角体验优先，记录失败时必须提供离线降级。
5. 记忆搜索只能基于用户自己的 Moment 证据回答。
6. AIUI 页面必须适配 448 × 352 的单绿色显示设备。
7. UI 默认不使用 emoji，不使用大面积装饰性色块。

## Capabilities

- **Permissions**:
  - camera
  - microphone
  - network
  - audio
- **Intents**:
  - record_moment
  - search_memory
  - generate_summary
  - daily_review
  - create_habit

## Project Structure

- `app.json`：AIUI 路由与全局窗口配置。
- `app.js`：应用生命周期及全局配置。
- `pages/index/index.ink`：Moment 记录入口。
- `pages/timeline/timeline.ink`：生活时间线。
- `pages/search/search.ink`：AI Memory Search。
- `services/`：本地 Repository、AI 理解与格式化逻辑。
- `prompts/`：版本化 Agent Prompt。
- `docs/`：架构、API、数据库和 MVP 计划。

## Development Notes

- 页面统一使用单文件 `.ink` 模式，不与多文件页面定义混用。
- 只使用 AIUI 已确认的组件、事件、API 和 WXSS 属性。
- 优先使用 AIUI 主题 token。
- 当前 MVP 使用 `wx` 本地存储；接入云端时替换 Repository，不改页面领域模型。
