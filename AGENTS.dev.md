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

## MVP 边界

当前 MVP 是**纯本地**应用，以下能力**不进入 AIX Runtime**，只在 `docs/` 维护设计：

- Cloud Sync（云端同步）
- 远程 MCP（MCP Server 调用）
- MCP Apps（第三方 Agent 入驻）

修改代码时，不要为这些能力添加运行时实现。相关设计文档可更新，但不要在 `services/` 或 `pages/` 中引入对应逻辑。

## 代码结构约定

- **页面**：统一使用单文件 `.ink` 模式，每个页面一个目录（`pages/<name>/<name>.ink`）
- **AIUI 限制**：只使用 AIUI 已确认的组件、事件、API 和 WXSS 属性
- **主题**：优先使用 AIUI 主题 token
- **存储**：当前 MVP 使用 `wx` 本地存储（`wx.getStorageSync` / `wx.setStorageSync`）
- **基础设施**：`services/controls.js` 提供按键映射，是页面交互的基础

## 当前页面结构

```
pages/welcome/welcome.ink   # 欢迎页（入口），点击/唤醒后根据绑定状态分流
pages/scan/scan.ink         # 扫码绑定页，自动打开相机扫码
pages/index/index.ink       # 主页（对话页面框架，对话功能待实现）
```

绑定状态存储 key：`deviceBound`（`wx.getStorageSync('deviceBound')`）

## 禁止事项

- 禁止使用未在 AIUI 文档中确认的组件或 API
- 禁止在 MVP 阶段引入 Cloud Sync、远程 MCP 或 MCP Apps 的运行时代码
- 禁止跳过 `npm run verify:mvp` 直接提交
- 禁止提交超过 10MB 的 `.aix` 包
- 禁止修改后不打包 `.aix` 就结束任务
