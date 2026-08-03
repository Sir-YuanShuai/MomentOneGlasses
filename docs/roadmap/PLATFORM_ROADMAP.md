# 跨平台实施路线图

> 文档状态：Draft 1.0  
> 更新日期：2026-08-03

## 当前阶段

当前只执行"本地 MVP"工作，不开始 Cloud、远程 MCP、Mobile/Web 或 MCP Apps Runtime。当前范围和发布标准见 [本地 MVP 范围](../mvp/LOCAL_MVP_SCOPE.md)。

以下阶段均为后续规划，只有本地领域模型、Tool Schema、真机交互和回归用例稳定后才启动。

> **阶段编号说明**：本路线图与根目录 [ROADMAP_AND_EXTENSIONS.md](../../../docs/roadmap/ROADMAP_AND_EXTENSIONS.md) 的阶段编号保持一致。
> Server 子项目的 Phase 编号通过括号标注（如"阶段 1（Server Phase 0-1）"）。

## 阶段 0：领域契约稳定

目标：在继续增加客户端前固定跨平台语义。

交付：

- Moment Domain v1；
- Tool Contract v1；
- ViewModel Contract v1；
- 错误码；
- Revision、Cursor、Idempotency 规则；
- Prompt 和 Tool 版本策略。

完成标准：眼镜、本地测试和未来服务端可以使用同一组 Fixture 通过契约测试。

## 阶段 1：Moment Cloud Core（Server Phase 0-1）

交付：

- FastAPI 工程骨架；
- Casdoor OIDC 验证；
- 用户自动映射；
- PostgreSQL migration；
- Moment 创建、详情、修改和列表；
- Revision 乐观锁；
- Idempotency 幂等；
- Cursor 分页；
- Audit Event。

完成标准：用户只能访问自己的 Moment；创建可幂等重试；修改发生 Revision 冲突时不会覆盖；列表支持稳定分页。

## 阶段 2：媒体与搜索（Server Phase 2）

交付：

- MinIO Upload Intent；
- 上传完成确认；
- Moment 与 Asset 关联；
- 短期下载地址；
- PostgreSQL 结构化搜索；
- `pg_trgm` 模糊搜索；
- 媒体清理策略。

完成标准：客户端不持有 MinIO 永久凭据；媒体默认私有；Moment 可安全关联图片和音频；中文查询达到首期可用标准。

## 阶段 3：删除、安全和运行能力（Server Phase 3）

交付：

- Delete Preview / Confirm；
- Tombstone；
- 基础限流；
- 日志和健康检查；
- 数据备份与恢复演练；
- 数据导出和账号删除设计。

## 阶段 4：眼镜同步

交付：

- `SyncingMomentRepository`；
- 本地 Outbox；
- 媒体断点或重试上传；
- Revision；
- Tombstone；
- 同步状态 UI；
- 网络不可用降级。

完成标准：眼镜离线创建 Moment，联网后能在云端和另一客户端看到。

## 阶段 5：只读 Moment MCP Server

首批 Tools：

```text
moments_search
moments_list
moments_get
moments_count
reviews_daily
```

交付：

- OAuth；
- `moments.read` Scope；
- Streamable HTTP；
- Cursor；
- 结构化结果；
- Agent 访问审计；
- MCP Client 兼容测试。

完成标准：外部 Agent 经用户授权后只能查询该用户的 Moment。

## 阶段 6：Mobile / Web

交付：

- 登录；
- 时间线；
- Moment 详情；
- 搜索和过滤；
- 媒体图库；
- 修改和删除；
- 同步冲突；
- Agent 授权管理；
- Agent 访问记录。

完成标准：手机可以完整管理眼镜记录的 Moment。

## 阶段 7：MCP 写操作

逐步开放：

```text
moments_create
moments_update
moments_delete_preview
moments_delete_confirm
memory_config_get
memory_config_set
```

交付：

- 写 Scope；
- 幂等；
- Revision 冲突；
- 两阶段确认；
- Tool Policy；
- 高风险操作审计。

完成标准：第三方 Agent 无法在没有明确意图和确认的情况下删除或覆盖 Moment。

## 阶段 8：MCP Apps

首批 UI：

```text
Timeline
Search Results
Moment Detail
Daily Review
Delete Confirmation
```

要求：

- `structuredContent`；
- 文本降级；
- Host Bridge Tool Call；
- CSP；
- 无长期凭据；
- AIUI 只读卡片适配；
- 手机/Web 原生 ViewModel 对齐。

完成标准：支持 MCP Apps 的 Host 可展示丰富 UI，不支持的 Host 仍能完成同一功能。

## 阶段 9：外部个人数据 MCP

候选：

- 日历；
- 健康；
- 地图收藏；
- 相册；
- 云盘；
- 邮箱。

原则：

- 只接入用户授权来源；
- 默认不永久保存；
- 转换为 Moment 前确认；
- 保存完整 Provenance；
- 可撤销授权和删除派生数据。

## 持续工作

所有阶段持续执行：

- Prompt Eval；
- Tool Contract Test；
- MCP Compatibility Test；
- 隐私审计；
- AIX 体积检查；
- 真机能力验证；
- 失败降级测试；
- 数据导出和删除演练。
