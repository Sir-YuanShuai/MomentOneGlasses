# Moment One 文档索引

## Current MVP

- [纯本地 MVP 范围](./mvp/LOCAL_MVP_SCOPE.md)

## Architecture

- [跨平台总体架构](./architecture/CROSS_PLATFORM_ARCHITECTURE.md)
- [MCP 与 MCP Apps 架构](./architecture/MCP_APP_ARCHITECTURE.md)

## Contracts

- [Moment MCP Server 契约](./contracts/MCP_SERVER_CONTRACT.md)

## Security and Sync

- [身份、同步与安全](./security/IDENTITY_SYNC_SECURITY.md)

## Decisions

- [ADR-0001：存储与 MCP 边界](./decisions/0001_STORAGE_AND_MCP_BOUNDARIES.md)

## Roadmap

- [跨平台实施路线图](./roadmap/PLATFORM_ROADMAP.md)

## Debugging

- [扫码绑定：相机与二维码识别排障记录](./debugging/QR_BINDING_SCANNER.md)

## Delivery

- [AIX 本地打包与体积校验](./delivery/AIX_PACKAGING.md)

## 文档维护规则

- 运行时 Prompt 以 `prompts/*.js` 为唯一代码真源；Markdown 只解释设计。
- Tool Schema 以 `services/tools/definitions.js` 为当前 AIUI 真源，未来迁移到共享 `packages/tool-definitions/`。
- 与安全、删除、身份、存储和同步相关的改动必须新增或更新 ADR。
- 文档中的目标架构不代表当前 MVP 已全部实现；以“当前实现”和路线图完成标准为准。
