# MomentOneGlasses — Agent 开发规范

> 本文件规范 AI Agent 在 `MomentOneGlasses` 仓库中的开发行为。
> 业务身份和 AIUI Manifest 见 `AGENTS.md`，不在本文重复。

## 权威文档优先级

修改代码或 Prompt 前，先确认以下文档的约束：

1. `prompts/*.js` — 运行时 Prompt 唯一真源（Markdown 只解释设计）
2. `services/tools/definitions.js` — Tool Schema 当前真源
3. `docs/mvp/LOCAL_MVP_SCOPE.md` — 当前 MVP 范围边界
4. `docs/architecture/CROSS_PLATFORM_ARCHITECTURE.md` — 跨平台架构
5. `docs/security/IDENTITY_SYNC_SECURITY.md` — 身份与同步安全
6. `docs/contracts/MCP_SERVER_CONTRACT.md` — MCP Server 契约（设计阶段，不进入 MVP Runtime）

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

## MVP 边界

当前 MVP 是**纯本地**应用，以下能力**不进入 AIX Runtime**，只在 `docs/` 维护设计：

- Cloud Sync（云端同步）
- 远程 MCP（MCP Server 调用）
- MCP Apps（第三方 Agent 入驻）

修改代码时，不要为这些能力添加运行时实现。相关设计文档可更新，但不要在 `services/` 或 `pages/` 中引入对应逻辑。

## 代码结构约定

- **页面**：统一使用单文件 `.ink` 模式，不与多文件页面定义混用
- **AIUI 限制**：只使用 AIUI 已确认的组件、事件、API 和 WXSS 属性
- **主题**：优先使用 AIUI 主题 token
- **存储**：当前 MVP 使用 `wx` 本地存储；接入云端时替换 Repository，不改页面领域模型
- **Repository**：`services/memory-repository.js` 是可测试的纯本地核心，不依赖 AIUI API
- **工具**：`services/tools/` 中的工具定义、参数校验和安全策略是 Agent Loop 的边界

## 快速记录规则

- 快速记录开启时**必须先拍照并显示预览**，再询问内容和媒体保存形式
- 不得在用户确认媒体选择前直接保存
- 当前 Camera API 仅支持拍照；用户选择视频时明确提示暂不支持，不伪造视频结果

## Prompt 维护规则

- 运行时 Prompt 以 `prompts/*.js` 为唯一代码真源
- 修改 Prompt 后必须重新运行 `npm run test:mvp` 验证行为
- Markdown 文档中的 Prompt 片段只用于解释设计，不作为运行时真源

## 禁止事项

- 禁止使用未在 AIUI 文档中确认的组件或 API
- 禁止在 MVP 阶段引入 Cloud Sync、远程 MCP 或 MCP Apps 的运行时代码
- 禁止跳过 `npm run verify:mvp` 直接提交
- 禁止提交超过 10MB 的 `.aix` 包
- 禁止在用户确认媒体选择前直接保存 Moment
- 禁止伪造视频录制结果
