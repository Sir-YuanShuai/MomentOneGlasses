# MCP Apps 端到端验证（眼镜端客户端）

验证 MomentOneGlasses 的 MCP 客户端（`services/mcp-client.js` + `services/binding.js`）
对 Server MCP 端点的三个基本能力：**MCP 发现 / 工具执行 / 错误与容错链路**。

采用「真实客户端代码 + 本地 standalone MCP Server」方式：
- 客户端直接 import 仓库里的 `services/mcp-client.js` 等真实文件；
- `wx` 模块由 `loader.mjs` 重定向到 `wx-shim.mjs`（Node 环境替身，实现 request/存储子集）；
- Server 侧用 MomentOneServer 的 fake-repos standalone 进程（`tests/api/standalone_mcp_server.py`），
  与生产相同的 Streamable HTTP + Bearer 鉴权语义，无需真实 DB / Casdoor。

## 运行

```bash
# 1) 启动本地 standalone MCP Server（MomentOneServer 目录）
cd ../MomentOneServer
.venv/bin/python tests/api/standalone_mcp_server.py --port 8765
# 输出 MCP_VERIFY_TOKEN=<token>，保持运行

# 2) 另开终端，跑验证脚本（MomentOneGlasses 目录）
cd ../MomentOneGlasses
MCP_VERIFY_TOKEN=<上一步输出的 token> \
  node --import ./dev/mcp-verify/register.mjs ./dev/mcp-verify/verify.mjs
```

环境变量：

| 变量 | 默认 | 说明 |
|---|---|---|
| `MCP_VERIFY_URL` | `http://127.0.0.1:8765/mcp` | 验证端点 |
| `MCP_VERIFY_TOKEN` | （必填） | standalone server 签发的 QR Binding 风格 token |

## 场景

| # | 场景 | 验证点 |
|---|---|---|
| S0 | 无 token → 401 | Server 认证门（curl 验证） |
| S1 | `tools/list` | 工具清单名称/描述/inputSchema |
| S2 | `bookkeeping_create` 合法 | 写入成功，返回 id/amount |
| S3 | 非法 payload | `INVALID_ARGUMENTS` 错误码透传 |
| S4 | `bookkeeping_summary` | 聚合口径（income/expense/balance/count/byCategory） |
| S5 | `bookkeeping_list` | 明细可查回 |
| S6 | 401 → 刷新 → 重试 | token 刷新后重试一次成功 |
| S7 | 会话过期（404 注入） | 重建会话后重试 |
| S8 | 未知工具 | JSON-RPC 错误透传 |

> `wx-shim.mjs` 的注入点（`__setRefreshHandler` / `__injectOnce`）只用于验证
> 容错链路，生产代码不依赖任何 shim。
