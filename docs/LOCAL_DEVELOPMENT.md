# AIUI 本地开发与调试环境

> 配置日期：2026-07-28
> 项目：一刻 YiKe · Moment One
> 目标运行尺寸：448 × 352

## 1. 目标

为 Moment One 提供一个不依赖真机即可启动的本地预览环境，用于：

- 编译和渲染 `.ink` 单文件页面；
- 检查 `app.json` 路由和页面入口；
- 调试页面生命周期、状态更新、路由和键盘事件；
- 在 Chrome DevTools 中查看 Ink Runtime 与业务日志；
- 在接入 Rokid 真机前验证 448 × 352 页面布局；
- 验证摄像头、语音或 LanguageModel 不可用时的降级流程。

本地环境不能完全模拟摄像头、麦克风、Rokid 物理按键、设备侧 LanguageModel、蓝牙链路、功耗和真机性能，最终结果仍以真机为准。

## 2. 技术方案

本地预览由两部分组成：

1. **Vite**：提供开发服务器、文件监听、自动刷新和预览构建。
2. **`@yodaos-pkg/ink`**：在浏览器 Canvas 中启动 Ink Runtime，并直接加载当前项目文件组成的 Bundle。

运行链路：

```text
MomentOne 源文件
  ├── app.json / app.js
  ├── pages/**/*.ink
  ├── services/**/*.js
  └── prompts/**/*.md
            ↓ Vite raw import
       Ink Bundle 文件表
            ↓ openBundle()
       Ink Web Runtime
            ↓
       448 × 352 Canvas
```

`dev/main.js` 使用 `import.meta.glob(..., { query: '?raw' })` 读取工程文件，因此不需要复制源代码到调试目录。修改 `.ink` 或 service 文件后，Vite 会触发页面刷新并重新加载 Bundle。

## 3. 环境要求

推荐：

- macOS；
- Node.js 22 LTS；
- npm 10 或更高版本；
- Chrome；
- VS Code。

项目提供 `.nvmrc`：

```bash
nvm install
nvm use
```

`package.json` 接受的 Node.js 范围：

```text
^20.19.0 || >=22.12.0
```

配置时本机环境：

```text
Node.js: v25.9.0
npm: 11.12.1
```

该环境已能完成依赖安装、静态检查和 Vite 构建。团队协作建议统一使用 Node.js 22 LTS，以减少工具链差异。

## 4. 安装依赖

首次拉取项目：

```bash
cd /Users/yuanshuai/Documents/project/MomentOne
npm install
```

核心依赖：

```json
{
  "dependencies": {
    "@yodaos-pkg/ink": "^0.14.0"
  },
  "devDependencies": {
    "vite": "^8.1.5"
  }
}
```

不要使用普通 Node.js 直接执行 `app.js`：

```bash
node app.js
```

`wx`、`speech`、`language-model` 等模块由 Ink/AIUI 宿主提供，不是常规 Node.js 模块。

## 5. 启动本地预览

```bash
npm run dev
```

默认地址：

```text
http://127.0.0.1:5173/
```

浏览器页面包含：

- 448 × 352 Ink Canvas；
- 当前入口页面选择器；
- 重新加载按钮；
- Runtime 运行状态；
- 键盘与日志提示。

入口页面可通过查询参数直接指定：

```text
http://127.0.0.1:5173/?page=pages/index/index
http://127.0.0.1:5173/?page=pages/timeline/timeline
http://127.0.0.1:5173/?page=pages/search/search
```

除 `page` 外的查询参数会作为页面启动参数传入。例如：

```text
http://127.0.0.1:5173/?page=pages/index/index&locationName=杭州
```

## 6. 静态检查

执行：

```bash
npm run check
```

检查内容：

- `app.json` 是否为合法 JSON；
- `app.js` 和 `services/*.js` 是否存在 JavaScript 语法错误；
- `app.json.pages` 对应的 `.ink` 文件是否存在；
- 每个 `.ink` 页面是否包含：
  - `<script def>`；
  - `<script setup>`；
  - `<page>`；
  - `<style>`；
- `<script def>` 是否为合法 JSON；
- `<script setup>` 是否能通过 ES Module 语法检查。

静态检查不能替代 Ink Runtime 编译。组件、WXSS、运行时模块和数据绑定问题仍需通过 `npm run dev` 查看 Runtime 日志。

## 7. 构建预览产物

```bash
npm run build:preview
```

产物目录：

```text
dist-preview/
```

该目录已加入 `.gitignore`。构建产物包含 Ink WebAssembly 文件，体积较大是正常现象。

## 8. Chrome DevTools 调试

启动页面后按：

```text
Command + Option + I
```

### Console

重点关注：

```text
[preview] preparing bundle
[preview] Ink bundle opened
Moment One launched
Moment One active
```

Ink Runtime 也会输出页面加载、模块执行、模板绑定和生命周期耗时。

业务日志建议带模块前缀：

```javascript
console.log('[record] started');
console.warn('[camera] capture unavailable', error);
console.error('[storage] save failed', error);
```

不要在日志中打印完整照片 Data URL、完整用户语音、精确位置或完整记忆证据。

### Runtime 对象

页面启动后可在 Console 使用：

```javascript
__MOMENT_ONE_DEV__
```

包含：

```text
view          Ink View 实例
files         当前 Bundle 文件表
appConfig     app.json 内容
initialPage   当前入口页面
launchQuery   页面启动参数
```

### 键盘事件

点击 Canvas 获取焦点后测试：

```text
Enter
ArrowUp
ArrowDown
ArrowLeft
ArrowRight
```

## 9. 本地能力范围

| 能力 | 本地预览 | 说明 |
|---|---|---|
| `.ink` 页面渲染 | 支持 | 使用 Ink Web Runtime |
| 页面路由 | 支持 | `navigateTo`、`navigateBack` |
| `setData` | 支持 | 可检查状态和模板更新 |
| 键盘事件 | 支持 | 点击 Canvas 后测试 |
| 本地存储 | 支持 | 以浏览器宿主实现为准 |
| 摄像头 | 支持桥接调试 | 模拟照片或浏览器预拍摄；真机仍使用 CameraContext |
| 麦克风 | 支持浏览器调试 | 浏览器 SpeechRecognition 或模拟识别 |
| `SpeechRecognition` | 支持 | Host Adapter 转换浏览器或模拟事件 |
| `LanguageModel` | 可选支持 | Vite 代理或 fallbackAnalyze |
| Rokid 物理按键 | 不支持 | 必须真机验证 |
| 性能、功耗、蓝牙 | 不支持 | 必须真机验证 |

## 10. 文件说明

```text
dev/
├── index.html             本地能力调试工作台和 448 × 352 Canvas
├── main.js                Bundle 收集、能力配置和 Ink Runtime 启动
├── host-capabilities.js   语音、摄像头和 LanguageModel Host Adapter
├── photo-bridge.js        最近一张调试照片的 Vite 内存桥接
├── llm-proxy.js           OpenAI-compatible LanguageModel 服务端代理
├── check.mjs              项目静态检查脚本
└── vite.config.js         Vite 服务、环境变量和构建配置
```

根目录新增或更新：

```text
.env.example          LanguageModel 本地代理环境变量模板
.nvmrc               推荐 Node.js 22
package.json          dev/check/build:preview scripts
package-lock.json     固定 npm 依赖版本
.gitignore            忽略密钥文件与 dist-preview
```

## 11. 配置过程记录

### 2026-07-28：环境检查

检查结果：

- VS Code 已安装；
- Node.js `v25.9.0` 已安装；
- npm `11.12.1` 已安装；
- 项目已存在 `@yodaos-pkg/ink` 和 Vite 依赖声明；
- 当前系统没有独立的 `aiui`、`jsui` CLI；
- 当前系统没有 Craft 桌面应用；
- 当前系统没有 ADB。

因此采用公开的 Ink Web SDK 加 Vite 构建本地浏览器预览，不依赖尚未安装的专用 CLI。

### 2026-07-28：预览宿主配置

完成：

1. 新增 `dev/vite.config.js`；
2. 新增 `dev/index.html`；
3. 新增 `dev/main.js`；
4. 新增 `dev/check.mjs`；
5. 新增 `.nvmrc`；
6. 更新 `package.json` scripts 和 Node engines；
7. 更新 `.gitignore`；
8. 更新 README 运行说明；
9. 执行依赖安装、静态检查、构建和浏览器运行验证。

### 2026-07-28：验证结果

依赖安装：

```text
npm install --no-audit --no-fund
added 1 package
```

静态检查：

```text
npm run check
AIUI 静态检查通过：8 个脚本/配置，3 个 .ink 页面。
```

预览构建：

```text
npm run build:preview
vite v8.1.5
19 modules transformed
build completed
```

主要构建产物：

```text
dist-preview/index.html
 dist-preview/assets/index-*.js
 dist-preview/assets/ink_web_bg-*.wasm
```

浏览器运行验证：

- `pages/index/index` 成功启动；
- `pages/index/index&locationName=杭州` 的启动参数成功传入；
- `pages/timeline/timeline` 成功启动；
- `pages/search/search` 成功启动；
- 三个页面均出现 `[preview] Ink bundle opened`；
- 未发现 Runtime `error` 级别日志；
- 页面选择器、运行状态和 448 × 352 Canvas 正常显示。

当前已知警告：

```text
using deprecated parameters for the initialization function
Template variable 'lastMoment.categoryMark' is missing from data
Template variable 'lastMoment.title' is missing from data
Template variable 'lastMoment.aiSummary' is missing from data
Template variable 'lastMoment.tagsText' is missing from data
```

第一条来自当前 Ink Web SDK 初始化链路，不阻止页面运行。后四条来自记录页初始状态 `lastMoment: null` 与模板字段访问，是业务页面数据初始化问题，也不阻止本地调试环境启动；后续应通过安全初始结构或单独的显示状态消除。

## 12. 常见问题

### 端口被占用

Vite 固定使用 5173 端口。如果端口被占用，先停止旧进程：

```bash
lsof -nP -iTCP:5173 -sTCP:LISTEN
kill <PID>
```

### 页面黑屏

依次检查：

1. Chrome Console 是否出现 `[preview] unable to start Ink runtime`；
2. `npm run check` 是否通过；
3. `app.json` 第一条路由是否存在；
4. `.ink` 页面是否包含完整的四个区块；
5. Network 中 Ink WASM 是否成功加载。

### 修改文件后没有刷新

确认修改的是项目根目录中的源文件，而不是 `dist-preview`。然后手动刷新浏览器或点击“重新加载”。

### 摄像头或语音不可用

本地环境允许能力不可用。Moment One 的产品规则要求记录失败时提供离线降级，因此应同时验证：

- 摄像头失败但语音可用；
- 语音失败但照片可用；
- LanguageModel 不可用；
- 三项能力均不可用时仍可保存基础 Moment。

## 13. 真机联调建议

本地预览通过后，再进入真机阶段：

1. 检查 `AGENTS.md` 权限声明；
2. 验证第一视角摄像头；
3. 验证麦克风和语音识别；
4. 验证 Rokid 实体按键；
5. 验证弱网和断网；
6. 验证前后台切换；
7. 检查 448 × 352 单绿色显示效果；
8. 检查启动耗时、连续记录、存储上限和功耗。

## 14. 本地语音、摄像头与 LanguageModel 调试

本地调试工作台为设备能力提供两类模式：

1. **模拟模式**：不申请系统权限，结果稳定，适合自动化和业务流程回归；
2. **浏览器真实模式**：调用 Chrome 麦克风或摄像头，适合验证真实权限与媒体数据。

模式选择会保存在浏览器 `localStorage` 中，重新加载后继续使用上一次选择。

### 14.1 推荐的首次验证流程

启动：

```bash
npm run dev
```

打开记录页后保持默认配置：

```text
语音模式：模拟语音
摄像头模式：模拟照片
LanguageModel：未配置，走离线降级
```

在“模拟识别文本”中填写测试内容，例如：

```text
今天在西湖边散步，阳光很好
```

工作台启动时会自动生成一张模拟第一视角照片，并通过本地照片桥接保存。随后在 Ink 页面点击“记录这一刻”。完整流程为：

```text
SpeechRecognition.start()
  ↓
Host Adapter 派发 speech.start / speech.result / speech.end
  ↓
记录页收到语音文本

本地模拟照片
  ↓ POST /api/local-photo
Vite 内存照片桥接
  ↓ GET /api/local-photo
记录页获得 imageDataUrl

语音 + 照片 + 时间 + 地点
  ↓
LanguageModel 不可用时 fallbackAnalyze()
  ↓
保存 Moment 到本地存储
```

该模式不需要摄像头或麦克风权限，适合作为每次开发后的基础回归测试。

### 14.2 使用真实浏览器语音识别

1. 将“语音模式”切换为“浏览器麦克风”；
2. 保持记录页打开；
3. 点击 Ink 页面中的“记录这一刻”；
4. Chrome 第一次询问麦克风权限时选择允许；
5. 对着电脑麦克风说话；
6. 观察“语音状态”和 Ink 页面中的转写文本。

宿主适配器使用：

```text
window.SpeechRecognition
或
window.webkitSpeechRecognition
```

并将浏览器事件转换为 Ink Host Capability 事件：

```text
speech.start
speech.audiostart
speech.soundstart
speech.speechstart
speech.result
speech.speechend
speech.soundend
speech.audioend
speech.end
```

排查建议：

- 必须从用户点击触发识别，不能在页面加载时自动启动；
- `127.0.0.1` 和 `localhost` 可作为浏览器安全上下文使用媒体权限；
- Chrome 的 Web Speech Recognition 在不同系统和网络环境下可用性可能不同；
- 如果浏览器没有提供 SpeechRecognition，切回模拟语音验证业务流程，最终使用 Rokid 真机验证设备语音能力。

### 14.3 使用真实浏览器摄像头

当前 Ink Web `0.14.0` 的 `wx.media.createCameraContext()` Web Provider 不直接支持摄像头拍照。因此本地调试使用“浏览器预拍摄 + Vite 内存桥接”的方式，真机代码仍继续使用 `wx.media.createCameraContext()`。

操作步骤：

1. 将“摄像头模式”切换为“浏览器摄像头”；
2. 点击“准备并测试照片”；
3. Chrome 询问摄像头权限时选择允许；
4. 工作台通过 `navigator.mediaDevices.getUserMedia()` 打开系统默认摄像头；
5. 等待视频帧和自动曝光稳定，检测到近黑帧时自动重试一次；
6. 截取 JPEG 后停止视频 Track；
7. 右侧以 `object-fit: contain` 显示完整照片、分辨率和字节数；
8. 再点击 Ink 页面中的“记录这一刻”。

照片桥接流程：

```text
Chrome getUserMedia()
  ↓
video + canvas 截取一帧 JPEG
  ↓
POST /api/local-photo
  ↓
Vite 内存中保存最近一张照片
  ↓
AIUI localDebugPhotoEndpoint
  ↓
GET /api/local-photo
  ↓
转换为 data:image/...;base64,...
```

工作台不会把照片写入项目目录。照片只保存在当前 Vite 进程内存中，停止 `npm run dev` 后自动清除。

如果切回“模拟照片”，工作台会自动生成绿色网格测试图并更新照片桥接。

### 14.4 配置 LanguageModel

默认没有配置语言模型代理，Moment One 会验证确定性离线降级。启用模型前复制环境变量模板：

```bash
cp .env.example .env.local
```

填写：

```dotenv
AIUI_LLM_ENDPOINT=https://your-provider.example/v1/chat/completions
AIUI_LLM_API_KEY=your-secret-key
AIUI_LLM_MODEL=your-model-name
AIUI_LLM_API_STYLE=openai-chat-completions
AIUI_LLM_AUTH_HEADER=Authorization
AIUI_LLM_AUTH_SCHEME=Bearer
AIUI_LLM_HEADERS={}
```

也可以连接本机 OpenAI-compatible 服务：

```dotenv
AIUI_LLM_ENDPOINT=http://127.0.0.1:11434/v1/chat/completions
AIUI_LLM_API_KEY=
AIUI_LLM_MODEL=your-local-model
AIUI_LLM_API_STYLE=openai-chat-completions
AIUI_LLM_AUTH_HEADER=Authorization
AIUI_LLM_AUTH_SCHEME=Bearer
AIUI_LLM_HEADERS={}
```

真实模型配置只允许通过 `.env.local` 或启动进程环境变量提供。调试页面只显示脱敏状态和“测试真实 LLM 代理”按钮，不允许在浏览器中编辑 Endpoint 或 API Key。

修改 `.env.local` 后必须停止并重新启动 Vite：

```bash
npm run dev
```

当 `AIUI_LLM_ENDPOINT` 和 `AIUI_LLM_MODEL` 同时存在时，工作台会显示：

```text
真实代理已启用：...
```

AIUI 内的 `LanguageModel.create()` 会得到以下宿主配置：

```text
endpoint: http://127.0.0.1:5173/api/language-model
apiStyle: AIUI_LLM_API_STYLE
defaultModel: AIUI_LLM_MODEL
```

Vite 代理在服务端读取 `AIUI_LLM_API_KEY` 并转发请求，因此密钥不会注入浏览器 JavaScript Bundle。`.env.local` 已被 Git 忽略。

注意：

- 如果启用多模态模型，用户语音、地点和当前照片会发送到配置的模型 Endpoint；
- 仅在你信任该 Endpoint 时启用；
- `npm run build:preview` 生成的是静态页面，不包含 Vite 服务端代理；LanguageModel 联调需要使用 `npm run dev`；
- Endpoint 请求失败时，Moment One 会回退到 `fallbackAnalyze()`。

### 14.5 能力调试界面状态

右侧工作台会显示：

| 状态 | 含义 |
|---|---|
| 等待应用调用 SpeechRecognition | 尚未开始语音识别 |
| 模拟语音识别中 | 正在派发模拟识别事件 |
| 浏览器语音识别中 | 麦克风识别已启动 |
| 语音识别已结束 | 已派发最终结果和 end 事件 |
| 模拟照片已捕获 | 模拟图已存入本地照片桥接 |
| 浏览器照片已捕获 | 真实摄像头帧已存入照片桥接 |
| 未配置代理 | LanguageModel 将走离线降级 |
| 已启用本地代理 | LanguageModel 请求将通过 Vite 转发 |

### 14.6 本地能力安全边界

- 摄像头和麦克风权限由 Chrome 管理；
- 真实照片只保存在浏览器对象 URL 和 Vite 进程内存；
- API Key 只由 Vite 服务端读取；
- `.env.local` 不应提交；
- 模型代理启用后，模型输入会发送到配置的外部或本地 Endpoint；
- 本地浏览器验证不能替代 Rokid 真机的第一视角摄像头、实体按键、功耗和设备运行时验证。

## 15. 能力桥接配置验证记录

### 2026-07-28：模拟语音与模拟照片

实际执行并通过：

1. 启动 Vite 和 Ink Runtime；
2. 自动生成模拟照片；
3. 通过 `POST /api/local-photo` 写入内存桥接；
4. 点击“记录这一刻”；
5. 模拟 `SpeechRecognition` 发送最终中文转写；
6. AIUI 通过 `GET /api/local-photo` 读取照片 Base64；
7. LanguageModel 未配置，进入离线分析；
8. Moment 成功保存；
9. 页面显示“这一刻，已记住”；
10. Console 没有 `error` 级别日志，也没有照片桥接警告。

同时修复了 Ink Web 环境未提供 `crypto` 全局对象时的 ID 创建问题：优先使用 `globalThis.crypto.randomUUID()`，不可用时使用时间戳和随机数组合生成本地 Moment ID。

### 2026-07-28：代理与照片接口

验证结果：

```text
GET /api/local-photo
返回 mimeType、base64 和 updatedAt

POST /api/language-model（未配置环境变量）
返回 HTTP 503 和明确的配置提示
```

### 2026-07-28：摄像头画面与 LLM 配置收敛

根据真实浏览器照片首帧过暗的反馈，浏览器摄像头适配器已调整：

- 不再强制 `facingMode: environment`，桌面端改用系统默认摄像头；
- 视频元素临时挂载到 DOM，避免部分浏览器不产出稳定帧；
- 等待视频帧、自动曝光和白平衡稳定后再截图；
- 检测平均亮度接近黑帧时，额外等待并重拍一次；
- 调试状态显示照片分辨率和字节数；
- 预览改用 `object-fit: contain`，避免裁切或拉伸。

真实摄像头画面涉及用户设备和权限，本轮未自动访问摄像头，由开发者在浏览器中点击“准备并测试照片”进行最终确认。

LanguageModel 配置已收敛为环境变量只读：

- Endpoint、Model、API Key、认证 Header 和额外 Headers 只从 `.env.local` 或启动进程环境变量读取；
- 调试页面不再提供 Endpoint/API Key 编辑框；
- 页面只显示脱敏后的 Endpoint、模型名称、认证状态；
- 页面保留“测试真实 LLM 代理”按钮；
- 修改 `.env.local` 后必须重启 `npm run dev`。

使用本地 OpenAI-compatible SSE 假上游完成实际验证：

```text
GET  /api/language-model/config  → 正确读取环境变量
POST /api/language-model/test    → HTTP 200
POST /api/language-model         → SSE 流透传成功
AIUI LanguageModel.create()      → 成功获得真实代理响应
Moment analyzeMoment()           → 未进入 fallback
Moment 保存页面                  → 显示“已生成摘要与标签”
Console                          → 无 error 日志
```
