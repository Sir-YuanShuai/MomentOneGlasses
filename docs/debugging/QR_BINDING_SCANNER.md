# 扫码绑定：相机与二维码识别排障记录

- 状态：Craft 已验证二维码内容识别；deviceId 生成已改为显式 Crypto 模块，真实 binding code 换 token 待继续验证
- 日期：2026-08-05
- 适用版本：MomentOneGlasses `0.3.2`
- 范围：仅 `MomentOneGlasses`，不修改 Server

## 1. 最终采用的页面与流程

应用只保留一个入口页：

```text
pages/index/index
  ├─ 未绑定：显示绑定门，确认键进入 scan
  └─ 已绑定：显示 Moment 本地对话入口

pages/scan/scan
  ├─ onLoad/onReady 幂等初始化相机
  ├─ 确认键拍摄一张照片
  ├─ PNG/JPEG 解码为 RGBA
  ├─ AIX 内置 QR 解码器识别 rawValue
  ├─ 校验 momentone://bind?code=...
  └─ requestBinding(bindingCode)
```

独立的 `pages/welcome/welcome` 已删除。这样可以避免旧实现中 `index → welcome → scan/index` 的闪屏、回跳和缓存误判。

## 2. 官方 API 边界

### 2.1 相机是单次拍照，不是实时扫码

当前确认的相机调用是：

```js
const camera = wx.createCameraContext();
const photo = await camera.takePhoto({ quality: 'high' });
```

不同宿主暴露的位置可能不同，运行代码按以下顺序兼容：

1. `wx.createCameraContext()`；
2. `wx.media.createCameraContext()`。

`takePhoto()` 返回：

```text
photo.data      ArrayBuffer / TypedArray
photo.mimeType  image/png 或 image/jpeg
```

当前没有已确认的实时帧回调、VideoFrame 扫码或云端条码识别 API。扫码流程是本地拍摄一张照片后分析。

### 2.2 官方 BarcodeDetector 输入是 ImageData

AIUI 0.15.0 的条码文档只确认 `ImageData` 输入，不确认 Blob、ImageBitmap、VideoFrame、HTMLImageElement、HTMLVideoElement 或 HTMLCanvasElement。

官方概念路径是：

```text
Canvas getImageData() → BarcodeDetector.detect(ImageData)
```

实际排障中发现，不同 Craft/设备宿主的 Canvas 构造器注册并不完全一致：加载 `canvas` 模块时曾因缺少 `CanvasGradient` 导致 scan 页面在模块求值阶段失败。为了让 Craft 与真机使用一致的数据路径，发布代码不加载 `barcode` / `canvas` 模块，改为 AIX 内置纯 JS QR 解码器。

## 3. 当前实现为什么内置图片和 QR 解码

### 3.1 不把压缩文件直接当像素

相机返回的是 PNG/JPEG 压缩文件字节。二维码识别前必须：

```text
PNG/JPEG ArrayBuffer
→ 图片解码
→ width × height × 4 的 RGBA
→ QR 像素解码
```

例如 320 × 320 图片解码后的预期大小是：

```text
320 × 320 × 4 = 409600 bytes
```

### 3.2 AIX 不能在运行时解析 npm 裸模块

QuickJS 不会自动加载：

```js
import jpeg from 'jpeg-js';
import jsQR from 'jsqr';
```

曾出现：

```text
Module not found: jpeg-js
```

因此开发依赖只在构建阶段使用：

```text
scripts/image-decode-source.js
  → scripts/bundle-image-decode.mjs
  → services/image-decode.js

scripts/qr-fallback-source.js
  → scripts/bundle-qr-fallback.mjs
  → services/qr-fallback.js
```

AIX Runtime 只加载 `services/` 中已经自包含的相对路径模块。

## 4. 相机生命周期状态机

不能只依赖 `onReady()`。部分宿主日志未显示 `onReady` 被调用，曾导致页面永久停留在“正在检查扫码能力”。

当前策略：

- `onLoad()` 使用 `setTimeout(..., 0)` 排队初始化；
- `onReady()` 再幂等补偿；
- 用 `scannerInitializing` 防止并发创建；
- 用 `scannerState` 表示：
  - `initializing`
  - `ready`
  - `unsupported`
  - `error`
- `initializing` 阶段拦截确认键，只提示等待，不误报设备不支持。

Craft 2026-08-05 实测能力：

```text
hasTopLevelCreateCameraContext: false
hasMedia: true
hasMediaCreateCameraContext: true
```

因此 Craft 实际走 `wx.media.createCameraContext()`。

## 5. 已验证日志

2026-08-05 使用固定测试二维码验证：

```text
[moment-one:binding-scan] camera context ready
[moment-one:binding-scan] photo captured Object {
  mimeType: 'image/png',
  byteLength: 687,
  width: 320,
  height: 320,
  sizeSource: 'decoded',
  pixelByteLength: 409600
}
[moment-one:binding-scan] local QR decoder Object {
  found: true,
  pixelByteLength: 409600
}
[moment-one:binding-scan] QR content Object {
  index: 0,
  format: 'qr_code',
  rawValue: 'momentone://bind?code=MockBindingCode_1234567'
}
[moment-one:binding-scan] detection complete Object {
  detectionCount: 1,
  formats: ['qr_code'],
  containsMomentOneBinding: true
}
```

这证明以下链路已通过：

```text
CameraContext
→ takePhoto
→ PNG 解码
→ RGBA
→ QR 解码
→ rawValue
→ Moment One payload 解析
```

## 6. 当前后续阻塞点

二维码识别后首次进入 `requestBinding()` 时，QuickJS 报：

```text
crypto is not defined
```

失败发生在 `getDeviceId()`，请求尚未发送到 Server，也没有进入 token 持久化。因此 UI 显示“无法保存绑定信息”并不准确。

修复方式：

- 按 AIUI 官方入口使用 `import crypto from 'crypto'`，不再依赖未注入的全局 `crypto`；
- 优先调用模块的 `randomUUID()`；
- 保留符合 UUID v4 格式的本地降级生成；
- `DEVICE_ID_ERROR` 与 `STORAGE_ERROR` 分开映射。

下一验证点是真实 binding code 的 `/oauth/token` 响应。

## 7. 回归检查清单

每次修改扫码绑定后至少验证：

1. `app.json` 第一页是 `pages/index/index`；
2. AIX 的语义版本和首页 build 短码已更新；
3. scan 页面没有 `barcode` / `canvas` 裸模块依赖；
4. scan 页面可以进入，不出现 `CanvasGradient`；
5. 初始化期间按确认键不会误报“不支持扫码”；
6. 日志出现 `camera context ready`；
7. `pixelByteLength === width × height × 4`；
8. `local QR decoder.found === true`；
9. `QR content.rawValue` 与二维码原文一致；
10. 测试结束后评估是否移除或脱敏 rawValue 日志，避免泄露一次性 binding code；
11. 执行：

```bash
npm run verify:mvp
npm run pack:aix
npm run check:aix-size -- dist
```
