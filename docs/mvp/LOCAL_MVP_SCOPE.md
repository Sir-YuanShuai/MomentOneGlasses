# 本地 MVP 范围

- 状态：Current Implementation
- 日期：2026-07-30

## 1. MVP 目标

当前阶段完成 Rokid AIUI 设备内可运行、可离线降级的个人 Moment MVP。Moment 数据仍只保存在设备本地；唯一已接入的远端路径是设备扫码绑定所需的 Server OAuth 端点，不建设 Cloud PostgreSQL、对象存储、远程 MCP Server、跨设备同步或原生 MCP Apps。

核心目标：

```text
用户直接说完整指令
→ LanguageModel.tools 选择本地工具
→ 代码校验和执行
→ wx Storage 保存
→ 设备内查询、修改、删除和配置
```

## 2. 当前包含

### 2.1 Moment 本地 CRUD

- 用户直接表达具体生活经历、当下观察或感受时创建 Moment，不要求记录命令前缀；
- 查询、统计和回顾本地 Moment；
- 修改已有 Moment；
- 删除单条 Moment；
- 清空全部 Moment；
- 删除和清空必须二次确认。

### 2.2 本地持久化

使用：

```text
wx.getStorageSync
wx.setStorageSync
wx.removeStorageSync
```

当前限制：

- 单设备数据；
- 最多保存 120 条 Moment；
- 无数据库索引；
- 无跨设备同步；
- 无云端备份；
- 卸载或清理存储可能导致数据丢失。

### 2.3 AI 能力

- `SpeechRecognition` 获取语音；
- `LanguageModel.tools` 规划本地操作；
- LanguageModel 生成 Moment 摘要、分类和标签；
- LanguageModel 根据本地 Moment 证据回答；
- 模型不可用时使用确定性规则降级。

#### 语音输入可用时机与边界

```text
用户唤醒（"一刻"）
  ↓
onVoiceWakeup 接收 keyword
  ├─ keyword 为空或仅为唤醒词 → 进入默认交互（快速记录或意图监听）
  └─ keyword 包含自然语言指令 → 直接交给 Agent Loop 识别意图
        ↓
      routeRecognizedText
        ↓
      runAgentTurn（LanguageModel.tools）
        ├─ LLM 可用 → LLM 选择工具 → resolveToolCall 校验参数 → 执行
        └─ LLM 不可用 → fallbackRecognizeIntent 规则降级 → 执行
```

**可用时机：**

- 页面处于 `listening` 阶段时，`SpeechRecognition` 自动监听
- 用户唤醒后跟随自然语言指令时，直接识别意图
- 快速记录拍照完成后，自动进入监听询问记录内容
- 媒体选择阶段（保存照片 / 重拍 / 不保存 / 录音），监听用户选择

**边界：**

- `SpeechRecognition` 依赖宿主能力：真机由 AIUI `speech` 模块提供，模拟器由 `hostCapabilities.speech` 桥接
- `LanguageModel` 依赖宿主能力：真机由 AIUI 提供，模拟器由 `/api/language-model` 代理
- LLM 不可用时，`fallbackRecognizeIntent` 提供确定性规则降级（纯正则，覆盖有限）
- `resolveToolCall` 信任 LLM 的工具调用决策，仅校验参数完整性；安全由页面两阶段确认保证
- 模拟器 mock 模式下，需在调试面板手动输入模拟语音文本
- 模拟器 browser 模式下，使用浏览器 Web Speech API（需 HTTPS 或 localhost）

### 2.4 第一视角画面

快速记录开启时使用分阶段流程：

```text
先拍照
→ 显示预览
→ 询问想记录什么
→ 选择保存照片 / 重拍 / 不保存照片 / 录制短音频
→ 保存 Moment
```

摄像头不可用时继续询问记录内容，并允许保存文字描述或尝试录音。

短音频在设备端通过 `wx.media.getRecorderManager()` 录制约 8 秒并作为 Moment 媒体附件保存。本地 Flight Recorder 使用短时模拟音频验证完整交互链；真机录音权限、音频路径持久性和设备中断行为仍需在 Rokid 设备验证。

当前确认的 AIUI `CameraContext` 只提供 `takePhoto()`，没有已确认的视频录制 API。用户选择视频时明确提示暂不支持，不生成虚假媒体。

### 2.5 UI

沉浸式：

```text
pages/index/index
```

非沉浸式对话流卡片：

```text
pages/cards/moment-result
pages/cards/memory-answer
pages/cards/account-unbind（确认解绑账号）
```

卡片不包含按钮或 `bindtap`，后续操作通过下一轮语音完成。

### 2.6 设备绑定（鉴权边界）

AIX 已接入 index 绑定门 → scan → index 的设备绑定代码路径：

- Web 生成 `momentone://bind?code=<binding_code>` 二维码；
- 眼镜扫码后只调用 MomentOneServer `/oauth/token`，不接触 Casdoor 凭据；
- Server 使用 RS256 签发 access token 与 refresh token；
- refresh token 最长 30 天且不滚动，过期或撤销后必须重新扫码；
- 该远端路径只建立身份绑定，不改变 Moment 数据仍为本地存储的 MVP 边界。

当前状态是“代码已接入、官方模拟器与真机待验收”，不得在验收前写成真机已完成。

### 2.7 调试

Flight Recorder 支持：

- 模拟 STT；
- 浏览器语音；
- 模拟或浏览器照片；
- LanguageModel 代理；
- Tool Calling Trace；
- 页面路由预览。

## 3. 当前不包含

以下能力只保留设计文档，不进入当前 AIX：

```text
Cloud PostgreSQL
Object Storage
Cloud Moment API
跨设备同步
Mobile / Web App
Moment MCP Server
外部 MCP Client
MCP Gateway
原生 MCP Apps UI Resource
第三方 OAuth / Agent Scope
云端 Agent 审计
向量数据库或 pgvector
```

## 4. 本地架构

```text
Speech / Initial Utterance
        ↓
LanguageModel Tool Planner
        ↓
Tool Registry / Policy
        ↓
Local Moment Executor
        ↓
wx Storage Repository
        ↓
AIUI Page / TTS / Read-only Card
```

## 5. 数据边界

当前 Repository 分为：

```text
services/memory-repository.js  可测试的纯逻辑核心
services/memory-store.js       AIUI wx Storage 绑定
```

页面和 AgentLoop 不应新增直接的 `wx` 数据操作；所有 Moment 数据操作继续通过 `memory-store.js`，便于未来替换为 Repository 接口。

## 6. 发布标准

每次 MVP 发布至少验证：

- “今天第一次带妈妈看海”“今天天气不错”等具体生活陈述能够保存；
- 百科问题、写作请求和不明确内容不会误保存；
- 普通陈述不会误保存；
- 查询只能使用本地 Moment；
- 修改可以定位目标；
- 删除需要确认；
- LanguageModel 不可用时规则降级；
- 摄像头不可用时仍可保存；
- 快速记录会在对话前显示照片预览；
- 照片保存、重拍、不保存照片和录音选择可正确执行；
- 视频选择会明确降级提示；
- 非沉浸式卡片保持只读；
- `npm run check` 通过；
- `npm run test:mvp` 通过；
- `npm run build:preview` 通过；
- AIX 小于 10 MB。

完整本地验证：

```bash
npm run verify:mvp
```

## 7. 后续演进触发条件

完成以下本地验证后再进入 Cloud / MCP 阶段：

- Moment 模型和字段稳定；
- Tool Schema 稳定；
- 本地 CRUD 回归用例稳定；
- 真机语音、摄像头和生命周期通过；
- 用户确认本地 MVP 的主要交互；
- 确认云服务商、数据区域、认证和预算。

未来架构见：

- [跨平台总体架构](../architecture/CROSS_PLATFORM_ARCHITECTURE.md)
- [MCP 与 MCP Apps 架构](../architecture/MCP_APP_ARCHITECTURE.md)
- [Moment MCP Server 契约](../contracts/MCP_SERVER_CONTRACT.md)
- [存储与 MCP 边界](../decisions/0001_STORAGE_AND_MCP_BOUNDARIES.md)
- [跨平台实施路线图](../roadmap/PLATFORM_ROADMAP.md)
