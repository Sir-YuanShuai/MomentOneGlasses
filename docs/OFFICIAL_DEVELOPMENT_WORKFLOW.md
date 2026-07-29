# AIUI 官方开发与发布流程

> 调研日期：2026-07-29  
> 适用对象：Rokid AIUI / Ink 应用  
> 本文定位：官方流程索引，不是设备连接或发布 API 的替代说明。

## 1. 先区分三条链路

MomentOne 当前同时涉及三种不同的开发方式，不能混为一个流程：

| 链路 | 来源 | 用途 | 当前状态 |
|---|---|---|---|
| 本地 Vite + Ink Web Runtime | MomentOne 自建 | 浏览器中验证页面、业务状态和降级逻辑 | 已实现，见 [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) |
| Craft 网页工作台 | Rokid 官方 | 导入本地 AIUI/Ink 工程、编辑文件、实时预览 | 官方已公开，具体账号/能力以 Craft 页面为准 |
| AIUI DevTools / Rokid Glasses 真机 | Rokid 官方 | 验证设备交互、设备能力、性能和功耗 | 官方建议使用；连接和日志细节仍待确认 |

**本地 Vite 预览不是官方 Craft，也不能替代 AIUI DevTools 或真机验收。**

## 2. 官方资料

- [AIUI 官方文档](https://js.rokid.com/AIUI/)
- [AIUI 快速开始](https://js.rokid.com/AIUI/guide/quickstart?lang=zh-CN)
- [第一个沉浸式项目](https://js.rokid.com/AIUI/guide/quickstart-first-immersive?lang=zh-CN)
- [项目结构](https://js.rokid.com/AIUI/guide/structure?lang=zh-CN)
- [Craft 工作台](https://js.rokid.com/AIUI/tools/craft?lang=zh-CN)
- [AIUI 工具总览](https://js.rokid.com/AIUI/tools/intro?lang=zh-CN)
- [AIUI 真机调试](https://js.rokid.com/AIUI/tools/debug?lang=zh-CN)
- [AIUI 官方仓库](https://github.com/jsar-project/AIUI)
- [Rokid 灵珠平台](https://rizon.rokid.com/space/home)

官方文档如果更新，应以官方页面当前内容为准，并在本文顶部更新调研日期。

## 3. 创建本地 AIUI 工程

官方快速开始页面当前示例为：

```bash
npm create @yodaos-pkg/aiui-agent my-aiui-agent
```

官方脚手架包 README 还记录了以下写法：

```bash
npx @yodaos-pkg/create-aiui-agent my-aiui-agent
# 或
npx create-aiui-agent my-aiui-agent
```

这些命令来自同一官方 AIUI 生态的不同文档入口。以官方快速开始页面和生成后的 `package.json` 为准；不要在没有检查生成项目的情况下假定一定存在 `npm start`、`check` 或其他脚本。

脚手架项目通常包含：

```text
my-aiui-agent/
├── AGENTS.md
├── app.js
├── app.json
├── package.json
└── pages/
    └── index/
        └── index.ink
```

## 4. 官方工程结构

| 文件 | 作用 |
|---|---|
| `AGENTS.md` | 智能体身份、描述、能力、权限和系统规则 |
| `app.json` | 页面路由、首屏页面和全局配置 |
| `app.js` | 应用生命周期和全局逻辑 |
| `pages/` | 页面实现 |
| `assets/` | 图片、音频等静态资源 |

官方支持两种页面组织方式：

### `.ink` 单文件组件

```text
<script def>     页面配置
<script setup>   页面逻辑、生命周期和事件
<page>           页面结构
<style>          页面样式
```

### 多文件页面

```text
page.json
page.js
page.wxml
page.wxss
```

同一路由不要同时维护两种实现。官方文档说明同一路由同时存在时会优先加载 `.ink`；项目工程应主动避免这种歧义。

**MomentOne 当前情况：**所有页面使用 `.ink`，且 `npm run check` 的检查器目前只识别 `app.json.pages` 对应的 `.ink` 文件，不代表本项目已经支持多文件页面检查。

## 5. Craft 本地预览

官方 Craft 是 Web 工作台，不是本仓库的 Vite 开发服务器。公开资料确认的流程是：

1. 打开 [Craft](https://js.rokid.com/craft)；
2. 导入本地 AIUI 或 Ink 工程；
3. 浏览和编辑工程文件；
4. 使用页面预览和运行参数检查页面；
5. 修改代码后观察实时预览变化。

公开资料没有完整说明以下实现细节，因此不能从本文推断：

- 本地文件监听、同步冲突和保存协议；
- Craft 是否等同于完整设备 Runtime；
- 每一种摄像头、麦克风、实体按键、传感器和 LanguageModel 能力的模拟结果；
- 是否提供编辑器级 HMR 或源码直接推送到眼镜。

Craft 预览通过后，仍需进行真机验证。

MomentOne 针对 Craft `Interactive InkView` 的返回、点击、上滑、下滑映射，以及 STT 模拟输入的状态机实现见 [四键交互与 STT 状态机](./FOUR_BUTTON_INTERACTION.md)。

## 6. AIUI DevTools 与真机验收

官方调试资料建议使用 AIUI DevTools（调试体验类似 Chrome DevTools），并在真机上重点验证：

- 语音、手势和实体按键交互；
- 应用启动速度、卡顿和连续操作；
- 网络、本地存储和其他设备能力；
- 内存、功耗和弱网场景；
- 能力不可用或权限被拒绝时的降级行为。

截至本文调研日期，公开资料没有给出 AIUI 专用的完整配对和连接步骤。以下内容均为**待官方确认**，不能自行用 `rokidos-cli` 或 ADB 命令替代：

- USB、Wi-Fi、蓝牙或二维码配对方式；
- 设备发现、安装、启动和卸载命令；
- AIUI 专用日志入口、日志传输协议和崩溃日志位置；
- CDP、远程 DevTools 或网络面板连接方式；
- 设备端源码热替换和自动重载。

`rokidos-cli` 面向传统 RokidOS/ROL 应用（例如 `.rpp` 产物），公开资料没有确认它可以安装或调试 AIUI `.aix`，不要将两者混用。

## 7. 打包与发布：公开流程和未确认项

官方 AIUI 文档将 AIX 描述为 AIUI 智能体的分发包格式，并提供 `aix` 包管理/打包 CLI 的文档。公开资料中的命令形态包括：

```bash
aix pack <source-directory>
aix pack <source-directory> -o my-agent.aix
aix list <AIX-file>
# list 的别名

aix ls <AIX-file>
```

官方文档曾给出基于 Cargo 源码路径的安装示例，但当前公开仓库结构和可获取的 CLI 发布方式需要再次核对。因此本文**不把某个 Cargo 路径、npm 包或全局安装命令写成已验证的安装步骤**。特别是：

- `@yodaos-pkg/aix` 是 AIX reader 库，不应当作 CLI；
- `rokidos-cli` 是另一套 RokidOS 工具，不应当作 AIUI 打包工具；
- 本仓库当前没有官方 AIX CLI、签名或发布脚本。

能从官方发布资料确认的业务流程是：

```text
本地 AIUI 工程
    ↓
生成 AIX 分发包
    ↓
登录 Rokid 灵珠平台
    ↓
应用管理 → 创建应用 → 选择 AIUI 智能体
    ↓
版本管理 → 上传版本
    ↓
提交审核
    ↓
审核通过后发布到 Rokid Glasses 智能体商店
```

官方资料提到平台会校验 `VERSION` 和 `AGENTS.md`，并审核性能、交互规范和安全性。修改版本后，需要重新生成分发包、上传新版本并重新提交审核；版本更新机制和 `VERSION` 的作用以官方 AIX/发布文档为准。

尚未从公开资料确认：

- CLI 的当前可安装来源、版本和签名方式；
- 上传 API、鉴权字段和自动化 CI/CD；
- 包大小限制、审核 SLA、拒审处理和回滚；
- 灰度发布、设备安装和发布后状态查询。

## 8. MomentOne 对照表

| 官方环节 | MomentOne 当前状态 | 说明 |
|---|---|---|
| 本地 AIUI 工程 | 已有 | `AGENTS.md`、`app.json`、`app.js`、3 个 `.ink` 页面 |
| 官方脚手架 | 未接入 | 当前仓库是既有工程，不需要重新脚手架；新项目可按上方官方命令创建 |
| Craft 导入预览 | 未验证 | 需使用官方 Craft 账号和入口单独验证 |
| 本地浏览器预览 | 已有 | 自建 Vite + Ink Web Runtime，见 [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md) |
| AIUI DevTools | 未验证 | 当前本地主要使用浏览器 DevTools，不等同于官方 DevTools |
| 真机交互与能力 | 未完成 | 需要官方设备连接和调试链路 |
| AIX 打包 | 未接入 | CLI 安装来源和版本需先确认 |
| 灵珠上传、审核、发布 | 未执行 | 需要账号、分发包和平台权限 |

## 9. 待确认问题

设备连接、日志、Host Capability、CameraContext Web Provider、官方 CLI 和发布自动化问题，集中记录在 [OFFICIAL_AIUI_TOOLING_QUESTIONS.md](./OFFICIAL_AIUI_TOOLING_QUESTIONS.md)。该文件是咨询模板和沟通记录，不是官方事实来源。

本地浏览器 fallback 的安装、运行、能力桥接和验证方法，见 [LOCAL_DEVELOPMENT.md](./LOCAL_DEVELOPMENT.md)。
