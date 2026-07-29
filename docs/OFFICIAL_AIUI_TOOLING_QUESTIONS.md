# AIUI 本地开发工具、模拟器与真机调试能力咨询

> 编写日期：2026-07-28
> 当前评估版本：AIUI / Ink 0.14.0
> 用途：面向 Rokid AI Glasses 的通用技术预研，不包含具体应用信息
>
> **文档性质：咨询模板与沟通记录，不是官方操作手册。**本文中的问题、待回复状态和本项目对 Ink Web 的观测都未获得 Rokid 官方确认；不得据此推断 CLI、设备连接、日志、模拟器或发布流程。已确认的官方资料入口见 [AIUI 官方开发与发布流程](./OFFICIAL_DEVELOPMENT_WORKFLOW.md)。

## 隐私原则

对外沟通时不提供：

- 应用名称、品牌或产品定位；
- 业务流程、用户数据或应用截图；
- 内部代码、仓库地址和目录结构；
- Prompt、模型策略和数据结构；
- 自研调试工具的完整实现细节；
- 未公开的研发计划和团队信息。

如官方需要复现问题，只提供最小化代码、Runtime 版本、错误信息和必要的系统环境。

## 推荐邮件主题

```text
咨询 AIUI 0.14.0 本地模拟器、Craft、Host Capability 与真机调试能力
```

## 推荐正式邮件

Rokid AIUI 开发者团队您好：

我们正在评估使用 AIUI / Ink 开发 Rokid AI Glasses 应用，当前测试版本为 `0.14.0`。在本地开发工具、设备能力模拟和真机调试方面，希望确认以下技术问题：

1. AIUI 当前是否提供公开或可以申请内测的 Rokid AI Glasses 模拟器？

2. Craft / AIUI IDE 当前是否已经开放？如何获取访问入口、安装包或内测权限？

3. Craft 提供的是完整设备 Runtime，还是仅提供 AIUI 页面渲染和实时预览？

4. Craft 或官方模拟器目前可以模拟哪些设备能力？例如：

```text
摄像头
麦克风和 SpeechRecognition
TTS 和音频
实体按键
应用生命周期
网络
位置和传感器
LanguageModel
本地存储
```

5. **本项目本地观测（非官方结论）：**在 Ink Web `0.14.0` 中调用 `wx.media.createCameraContext()` 时，我们观察到以下错误：

```text
createCameraContext: CameraContext is not supported on web media provider
```

请问这是当前版本的预期限制吗？

6. `InkHostCapabilities.media.takePhoto()` 是否能够与 `wx.media.createCameraContext().takePhoto()` 打通？如果可以，正确的接入方法是什么？

7. CameraContext Web Provider 是否有计划支持的版本或预计时间范围？

8. 是否有完整的 Host Capability Provider 开发规范、TypeScript 类型、示例工程或兼容性测试？

9. AIUI 官方 CLI 的正式包名、安装方法和标准命令是什么？希望确认创建、启动、检查、构建、打包、安装和真机调试的完整流程。

10. AIUI 是否支持通过 USB、Wi-Fi 或其他方式进行远程真机调试？是否支持：

```text
安装和重新加载应用
读取 Console 和崩溃日志
查看网络请求
Chrome DevTools Protocol
页面树和 Storage 检查
注入模拟语音、照片、按键或传感器数据
```

11. 官方目前推荐的完整开发流程是什么？是否可以提供从本地开发到真机验收的标准步骤？

12. 对于当前公开工具未覆盖的设备能力，官方建议开发者通过 Host Capability 自行实现测试适配，还是等待或申请使用官方模拟器？

如果方便，希望可以提供：

- 当前已开放开发工具的能力清单；
- Craft 或模拟器的获取方式；
- AIUI CLI 安装和使用文档；
- Host Capability 最小示例；
- 真机调试接入步骤；
- 暂未支持能力的计划版本；
- 对应的技术支持渠道。

感谢支持。

技术环境：

```text
AIUI / Ink：0.14.0
开发系统：macOS
目标平台：Rokid AI Glasses
```

联系人：________
联系方式：________

## 群聊或即时消息简版

```text
Rokid AIUI 团队您好，我们正在评估 AIUI / Ink 0.14.0 的开发工具能力，希望确认以下问题：

1. 当前是否有公开或可申请的官方眼镜模拟器？
2. Craft / AIUI IDE 是否已开放，如何获取入口或内测权限？
3. Craft 是完整设备 Runtime，还是仅页面渲染预览？
4. Craft 可以模拟摄像头、麦克风、按键、网络、传感器和 LanguageModel 中的哪些能力？
5. Ink Web 0.14.0 中 CameraContext 提示“不支持 web media provider”，这是预期限制吗？
6. InkHostCapabilities.media.takePhoto() 如何与 wx.media.createCameraContext() 打通？
7. 是否有完整的 Host Capability Provider 文档和示例？
8. AIUI CLI 的正式包名、安装方法和标准命令是什么？
9. 是否支持远程真机、CDP 和设备日志？
10. 是否支持注入模拟语音、照片、按键和传感器数据？
11. CameraContext Web Provider 和标准模拟器是否有计划版本？
12. 官方建议开发者通过 Host Capability 自行实现测试适配，还是等待或使用官方模拟器？

如果有相关文档、安装包、示例工程或白名单申请方式，麻烦提供。谢谢。
```

## 官方要求提供复现代码时

只提供类似下面的最小复现，不提供实际应用代码：

```javascript
import wx from 'wx';

export default {
  async testCamera() {
    try {
      const camera = wx.media.createCameraContext();
      const photo = await camera.takePhoto({ quality: 'high' });
      console.log('photo:', photo.mimeType, photo.data.byteLength);
    } catch (error) {
      console.error('camera error:', error);
    }
  }
};
```

同时只附带：

```text
AIUI / Ink 版本
操作系统版本
Node.js 版本
浏览器版本
完整错误信息
最小复现步骤
```

不要附带：

```text
真实页面文件
应用 Manifest
AGENTS.md
业务服务代码
用户数据
真实照片或语音
模型 API Key
完整仓库压缩包
```

## 后续详细问题

只有在官方确认对应技术负责人后，再按需要追加以下问题，不要第一次全部发送。

### Craft 与模拟器

1. 是否支持导入现有本地工程？
2. 是否支持 `.ink` 文件监听和自动刷新？
3. 是否支持页面 Schema 和启动 Query？
4. 是否支持配置设备分辨率和主题？
5. 是否支持权限拒绝、断网、超时等失败场景？
6. 是否支持模拟实体按键和应用前后台切换？

### SpeechRecognition

7. 是否有官方浏览器 Speech Provider？
8. 是否支持 interim、final、no-match、timeout 和 abort？
9. Web Speech API 与真机语音事件顺序是否一致？
10. 是否有官方错误码和兼容性说明？

### CameraContext

11. CameraContext Web Provider 当前的能力边界是什么？
12. `media.takePhoto` 的 Host Capability Payload 是否为稳定协议？
13. 是否支持使用电脑摄像头作为测试输入？
14. 是否支持预置图片作为虚拟摄像头输入？

### LanguageModel

15. 官方推荐如何配置 `LanguageModel.create()` 的 Endpoint？
16. 当前支持哪些 `apiStyle`？
17. 是否支持多模态、流式响应和工具调用？
18. API Key 推荐由哪个层级管理？
19. 是否有官方本地代理示例？

### CLI 与真机

20. 官方支持的 Node.js 版本是什么？
21. CLI 是否支持 Watch/HMR？
22. 是否支持安装、启动和停止真机应用？
23. 是否支持读取真机 Console、Network 和性能日志？
24. 是否支持 Source Map？
25. 是否有远程真机或设备测试服务？

## 沟通记录

| 日期 | 渠道 | 联系人 | 问题范围 | 官方回复 | 后续动作 |
|---|---|---|---|---|---|
| 2026-07-28 | 待发送 | 待确认 | 模拟器、Craft、CLI、Host Capability、真机调试 | 待回复 | 待确认 |
