# 扫码绑定：相机与二维码识别排障记录

- 状态：已对照 Rokid 官方 AIUI scanner sample 重构；0.3.7 增加 `<camera>`、WebP 解码与官方 BarcodeDetector 链路，待真机复测
- 日期：2026-08-05
- 适用版本：MomentOneGlasses `0.3.7`
- 范围：仅 `MomentOneGlasses`，不修改 Server

## 1. 最终采用的页面与流程

应用只保留一个入口页：

```text
pages/index/index
  ├─ 未绑定：显示绑定门，确认键进入 scan
  └─ 已绑定：显示 Moment 本地对话入口

pages/scan/scan
  ├─ onLoad/onReady 幂等初始化相机
  ├─ context 创建后 warm-up，准备完成前拦截确认键
  ├─ 确认键拍摄一张照片
  ├─ PNG/JPEG 解码为 RGBA
  ├─ AIX 内置 QR 解码器识别 rawValue
  ├─ 校验 momentone://bind?code=...
  └─ requestBinding(bindingCode)
```

独立的 `pages/welcome/welcome` 已删除。这样可以避免旧实现中 `index → welcome → scan/index` 的闪屏、回跳和缓存误判。

## 2. 官方 API 边界

### 2.1 官方 scanner sample 的真实链路

Rokid 官方 `jsar-project/AIUI` 仓库的 `samples/scanner` 已提供条码扫描完整示例。它不是直接在逻辑页里创建 context 后读取任意图片，而是：

```text
页面渲染 <camera> 组件
→ onShow/onReady 创建 CameraContext
→ 确认键调用 takePhoto({ quality: 'high' })
→ 等待 takePhoto Promise 完整返回
→ 根据 mimeType 解码 WebP
→ BarcodeDetector.detect({ data, width, height })
```

官方 sample 的关键点：

- 页面中必须存在 `<camera>` 预览组件；
- CameraContext 与页面 camera 组件配合使用；
- 相机捕获图主要按 WebP 处理；
- WebP 先由纯 JavaScript 解码器转换为灰度像素；
- 再把 `{ data, width, height }` 交给 `BarcodeDetector.detect()`；
- 这是“有实时预览、按确认键拍一张、拍完后识别”，不是持续读取视频帧实时解码。

此前 Glasses 页缺少 `<camera>`，并且把真机结果按 PNG/JPEG 处理，这正是模拟可用而真机预览后仍提示“无法读取照片”的主要原因。

当前实现已按官方 sample 补齐 `<camera>`，并内置官方 sample 使用的 WebP 纯 JS 解码链路。官方参考：[AIUI scanner sample](https://github.com/jsar-project/AIUI/tree/main/samples/scanner)。

### 2.2 官方 BarcodeDetector 输入是 ImageData

AIUI 0.15.0 的条码文档确认 `ImageData` 是支持的输入；官方 scanner sample 使用兼容的 `{ data, width, height }` 对象，不依赖 `HTMLVideoElement`、`HTMLCanvasElement` 或 `VideoFrame`。

不同 Craft/设备宿主的 Canvas 构造器注册并不完全一致：此前加载 `canvas` 模块时曾因缺少 `CanvasGradient` 导致 scan 页面在模块求值阶段失败。因此发布代码仍不加载 `canvas`，但现在按官方 sample 正确加载 `barcode`，并以 WebP → 灰度数据 → `BarcodeDetector.detect()` 作为真机主链路。

## 3. 当前实现为什么内置图片和 QR 解码

### 3.1 不把压缩文件直接当像素

相机返回的是 PNG/JPEG 压缩文件字节。二维码识别前必须：

```text
PNG/JPEG/WebP ArrayBuffer
→ 图片解码
→ gray 或 width × height × 4 的 RGBA
→ BarcodeDetector / QR 像素解码
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

AIX Runtime 只加载 `services/` 中已经自包含的相对路径模块。WebP 部分跟随官方 scanner sample 采用 `services/webp.js` 与 `services/vendor/webpjs/webpjs.source.js`；第三方许可证说明保存在 `services/vendor/webpjs/README.md`。

## 4. 相机生命周期与识别状态

当前按官方 scanner sample 对齐：

- 页面中渲染 `<camera class="scan-camera"></camera>`；
- `onShow()` / `onReady()` 幂等创建 `wx.media.createCameraContext()`；
- `onHide()` 释放 CameraContext；
- 确认键只调用一次 `takePhoto()`，等待 Promise 完整返回；
- 真机 WebP 走官方 WebP 解码器，再交给 `BarcodeDetector`；
- Craft PNG/JPEG 走本地图片解码；如果宿主 BarcodeDetector 没有结果，再走 bundled jsQR fallback；
- 相机预览期间 `capturing=true`，重复确认键不会再次拍摄。

如果宿主在拍摄期间短暂触发页面隐藏，捕获完成后会自动重新建立 CameraContext，保证下一次重试不落入“没有相机上下文”的状态。

## 5. 已验证链路

Craft 固定 PNG fixture 的本地 fallback 已通过，官方 WebP 解码器也已通过同一二维码的 WebP fixture 测试：

```text
WebP ArrayBuffer
→ official pure-JS WebP decoder
→ 320 × 320 RGBA
→ bundled jsQR fallback
→ momentone://bind?code=MockBindingCode_1234567
```

真机主链路预期为：

```text
<camera> 预览
→ CameraContext.takePhoto()
→ photo.mimeType = image/webp
→ decodeWebP(..., { output: 'gray' })
→ BarcodeDetector.detect({ data, width, height })
→ QR content.rawValue
→ findBindingCode()
```

## 6. 真机问题根因与 0.3.7 修复

真机表现为“先显示无法读取照片，随后预览图出现并消失”，不是简单的 Promise 等待不足。对照官方 scanner sample 后确认，之前实现有两个不一致：

1. scan 页面没有 `<camera>` 组件；
2. 真机主要返回 WebP，但之前只按 PNG/JPEG 处理。

0.3.7 已改为官方链路：

```text
<camera> 预览
→ wx.media.createCameraContext()
→ takePhoto()
→ WebP 纯 JS 解码
→ BarcodeDetector.detect()
→ findBindingCode()
```

这也解释了为什么模拟环境能跑通：Craft 返回 PNG/JPEG fixture，而真机返回 WebP。现在不再以“图片预览是否出现”判断完成，而是等待 `takePhoto()` Promise 返回后按真实 mimeType 解码。

真机复测时：

1. 安装 AIX 后确认首页版本显示为 `v0.3.7 · build <短码>`；
2. 进入扫码页，确认能看到相机预览区域；
3. 二维码保持稳定，只按一次确认键；
4. 等待相机预览完成，页面应自动进入识别，不需要再次确认；
5. 如果仍失败，记录页面上的最终提示和失败发生时相机预览是否已经出现即可，真机没有日志也可以继续定位。

## 6.1 关于是否需要提交官方 issue

目前不建议马上提交 issue，因为官方仓库已经有对应 scanner sample，并明确采用 `<camera>` + WebP 解码 + BarcodeDetector 的链路。若 0.3.7 仍失败，再提交 issue 时应以官方 sample 为最小复现，而不是提交当前完整业务应用。

## 7. 已解决的绑定持久化问题

之前的“无法保存绑定信息”实际由 QuickJS 缺少全局 `crypto` 触发，未必是设备存储失败。现在按 AIUI 官方模块方式导入 Crypto，并保留 UUID v4 降级生成；token bundle 写入后逐项回读校验，只有回读不一致才报告 `STORAGE_ERROR`。绑定成功后应看到：

```text
[moment-one:binding] token bundle persisted
```

日志只打印 bindingId 与过期时间，不打印 token 内容。

## 8. 回归检查清单

每次修改扫码绑定后至少验证：

1. `app.json` 第一页是 `pages/index/index`；
2. AIX 的语义版本和首页 build 短码已更新；
3. scan 页面包含 `<camera>` 组件；
4. scan 页面加载 `barcode`，不加载 `canvas`；
5. 真机 WebP 能被 `services/webp.js` 解码；
6. 确认键只触发一次 `takePhoto()`，等待 Promise 返回后再识别；
7. Craft PNG/JPEG fallback 仍能识别固定二维码；
8. 日志出现 `QR content.rawValue` 或页面显示绑定成功；
9. 测试结束后评估是否移除或脱敏 rawValue 日志，避免泄露一次性 binding code；
10. 执行：

```bash
npm run verify:mvp
npm run pack:aix
npm run check:aix-size -- dist
```
