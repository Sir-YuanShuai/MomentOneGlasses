# Moment One MVP 开发计划

## 阶段 0：项目初始化（当前）

- [x] 建立产品、技术、数据和 AI 架构文档。
- [x] 建立 AIUI 三页面信息架构。
- [x] 建立本地 Moment Repository 边界。
- [x] 建立多模态理解与确定性降级策略。
- [ ] 按 [AIUI 官方开发与发布流程](./OFFICIAL_DEVELOPMENT_WORKFLOW.md) 验证官方脚手架/Craft 导入路径。
- [ ] 确认官方打包工具可用性，并完成 AIX 分发包验证。
- [ ] 完成 Rokid Glasses 真机交互、设备能力和性能验收。
- [ ] 完成灵珠平台上传、审核状态和发布流程验证。

> 设备连接、官方 CLI 安装、日志链路和发布自动化仍有待官方资料或账号权限确认；在确认前不把本地 Vite 预览当作真机或发布验收。

## MVP 1：记录 Moment

验收标准：

1. 用户通过触控、硬件键或语音唤醒进入记录。
2. 客户端同时尝试采集语音与第一视角图片。
3. `LanguageModel` 可用时生成结构化 Moment。
4. 模型、摄像头或语音不可用时仍能保存降级 Moment。
5. 保存结果包含时间、地点状态、语音、图片状态、摘要、分类和标签。

## MVP 2：Moment Timeline

验收标准：

1. Moment 按发生时间倒序展示。
2. 跨日期时显示日期分隔。
3. 每条记录展示时间、标题、类别、标签和摘要。
4. 空状态不注入虚假示例数据。

## MVP 3：AI Memory Search

验收标准：

1. 支持语音查询和预设查询入口。
2. 本地检索先产生候选 Moment。
3. LLM 只依据候选 Moment 生成答案。
4. 无 LLM 时返回确定性的证据摘要。
5. 无证据时明确告诉用户未找到记录。

## 下一阶段

- Cloud Moment Repository 与离线同步队列。
- PostgreSQL + pgvector 混合检索。
- 媒体对象存储和缩略图。
- Moment 纠正、删除和隐私设置。
- Daily Review 与 Habit Discovery 异步任务。
- 自动化契约测试、Prompt 回归集和设备端性能测试。
