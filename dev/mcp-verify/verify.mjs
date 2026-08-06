// MCP Apps 端到端验证：驱动真实 services/mcp-client.js（+ binding.js）走完整链路。
//
// 前置：本地 standalone MCP Server 已启动（MomentOneServer）：
//   cd MomentOneServer && .venv/bin/python tests/api/standalone_mcp_server.py --port 8765
//
// 运行：
//   cd MomentOneGlasses && node --import ./dev/mcp-verify/register.mjs ./dev/mcp-verify/verify.mjs
//
// 环境变量：MCP_VERIFY_URL（默认 http://127.0.0.1:8765/mcp）
//           MCP_VERIFY_TOKEN（standalone server 输出的 token）
//           MCP_VERIFY_REFRESH_TOKEN（可省略，用占位串）
//
// 验证能力：1) MCP 发现 tools/list  2) 工具执行 tools/call（含错误链路）
//           3) 401 刷新重试与会话过期重建（客户端容错）
import { createMcpClient, describeMcpError } from '../../services/mcp-client.js';
import { getValidAccessToken } from '../../services/binding.js';
import {
  __seedStorage,
  __getStorage,
  __setRefreshHandler,
  __injectOnce,
  __clearInjections,
  __clearRequestLog,
  __requestLog
} from './wx-shim.mjs';

const VERIFY_URL = process.env.MCP_VERIFY_URL || 'http://127.0.0.1:8765/mcp';
const VERIFY_TOKEN = process.env.MCP_VERIFY_TOKEN || '';
const REFRESH_TOKEN_PLACEHOLDER = 'verify-refresh-token-placeholder';
const BINDING_ID_PLACEHOLDER = '22222222-2222-4222-8222-222222222222';

const results = [];
let failed = 0;

function report(name, ok, detail) {
  results.push({ name, ok, detail });
  if (!ok) failed += 1;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function seedTokenBundle(token) {
  __seedStorage({
    deviceId: 'verify-device-0000',
    bindingId: BINDING_ID_PLACEHOLDER,
    accessToken: token,
    refreshToken: REFRESH_TOKEN_PLACEHOLDER,
    accessTokenExpiresAt: nowSeconds() + 3600,
    refreshTokenExpiresAt: nowSeconds() + 30 * 24 * 3600
  });
}

function client() {
  return createMcpClient({ endpointUrl: VERIFY_URL });
}

async function expectToolError(promise) {
  try {
    await promise;
    return { threw: false };
  } catch (error) {
    return {
      threw: true,
      code: error && error.code,
      message: error && error.message,
      toolCode: error && error.toolCode
    };
  }
}

async function scenarioDiscovery() {
  const mcp = client();
  const { tools } = await mcp.listTools();
  const names = tools.map((tool) => tool.name);
  const required = ['bookkeeping_create', 'bookkeeping_list', 'bookkeeping_summary', 'bookkeeping_plan', 'moments_get'];
  const missing = required.filter((name) => !names.includes(name));
  report('S1 MCP 发现 tools/list', missing.length === 0 && tools.length > 0,
    `tools=${tools.length} 缺失=${missing.join(',') || '无'}`);
  if (tools.length) {
    console.log('    工具清单:');
    tools.forEach((tool) => {
      const schemaKeys = tool.inputSchema && tool.inputSchema.properties ? Object.keys(tool.inputSchema.properties) : [];
      console.log(`      - ${tool.name}  (${schemaKeys.join(', ')})`);
    });
  }
  const create = tools.find((tool) => tool.name === 'bookkeeping_create');
  report('S1b 工具参数契约 inputSchema', Boolean(create && create.inputSchema && create.inputSchema.required),
    create ? `required=${(create.inputSchema.required || []).join('/')}` : 'bookkeeping_create 缺失');
}

async function scenarioCreate() {
  const mcp = client();
  const result = await mcp.callTool('bookkeeping_create', {
    amount: 38.5,
    flow: 'expense',
    account: '微信',
    category: '餐饮',
    occurredAt: new Date().toISOString(),
    idempotencyKey: `verify-${Date.now()}`
  });
  report('S2 工具执行 bookkeeping_create', Boolean(result && result.id && result.amount === 38.5),
    `id=${result && result.id ? result.id.slice(0, 8) : '无'} amount=${result && result.amount}`);
  return result;
}

async function scenarioCreateInvalid() {
  const mcp = client();
  const outcome = await expectToolError(
    mcp.callTool('bookkeeping_create', {
      amount: 12,
      flow: 'expense',
      occurredAt: 'not-a-date'
    }),
    'INVALID_ARGUMENTS'
  );
  report('S3 非法 payload → INVALID_ARGUMENTS', outcome.threw && outcome.code === 'INVALID_ARGUMENTS',
    outcome.threw ? `code=${outcome.code}` : '未抛出错误');

  const outcome2 = await expectToolError(
    mcp.callTool('bookkeeping_summary', { period: 'fortnight' }),
    'INVALID_ARGUMENTS'
  );
  report('S3b 非法 period → 错误链路', outcome2.threw,
    outcome2.threw ? `code=${outcome2.code}` : '未抛出错误');
}

async function scenarioSummary() {
  const mcp = client();
  const summary = await mcp.callTool('bookkeeping_summary', { period: 'month' });
  const byCategory = Array.isArray(summary.byCategory) ? summary.byCategory : [];
  const food = byCategory.find((item) => item.category === '餐饮');
  // fake 内存仓库跨进程保留数据（standalone server 未重启时可能累计多笔），
  // 这里验证聚合口径成立：expense 至少包含本 run 写入的 38.5，分类小计命中。
  const ok = typeof summary.expense === 'number'
    && summary.expense >= 38.5
    && typeof summary.income === 'number'
    && typeof summary.balance === 'number'
    && typeof summary.count === 'number'
    && summary.count >= 1
    && food && Number(food.amount) >= 38.5;
  report('S4 工具执行 bookkeeping_summary', ok,
    `expense=${summary.expense} income=${summary.income} balance=${summary.balance} count=${summary.count} byCategory=${JSON.stringify(byCategory)}`);
  return summary;
}

async function scenarioList() {
  const mcp = client();
  const result = await mcp.callTool('bookkeeping_list', { limit: 20 });
  const items = Array.isArray(result.items) ? result.items : [];
  const found = items.find((item) => item.amount === 38.5 && item.category === '餐饮');
  report('S5 工具执行 bookkeeping_list', Boolean(found) && items.length >= 1,
    `total=${items.length} 命中=${found ? '是' : '否'} hasMore=${result.hasMore}`);
}

async function scenarioAuthRefresh() {
  // 用无效 access_token 触发 401 → 刷新（shim 拦截 /oauth/token）→ 重试成功
  __setRefreshHandler(() => ({
    statusCode: 200,
    data: {
      binding_id: BINDING_ID_PLACEHOLDER,
      access_token: VERIFY_TOKEN,
      refresh_token: REFRESH_TOKEN_PLACEHOLDER,
      expires_in: 3600
    }
  }));
  seedTokenBundle('definitely-invalid-token');
  __clearRequestLog();

  const mcp = client();
  const { tools } = await mcp.listTools();
  const log = __requestLog();
  const saw401 = log.some((entry) => entry.statusCode === 401);
  const refreshed = __getStorage().accessToken === VERIFY_TOKEN;
  report('S6 401 → 刷新 → 重试一次', saw401 && refreshed && tools.length > 0,
    `401命中=${saw401} 刷新后token已更新=${refreshed} tools=${tools.length}`);
  __setRefreshHandler(null);
}

async function scenarioSessionExpiry() {
  // 故障注入：下一次 tools/list 返回 404（会话失效）→ 客户端重建会话重试
  seedTokenBundle(VERIFY_TOKEN);
  __clearInjections();
  __injectOnce(
    (request) => request.method === 'POST' && String(request.data && request.data.method || '').includes('tools/list'),
    {
      statusCode: 404,
      data: { jsonrpc: '2.0', id: 99, error: { code: -32001, message: 'Not Found: Invalid or expired session ID' } }
    }
  );
  __clearRequestLog();

  const mcp = client();
  const firstSession = mcp.getSessionId();
  const { tools } = await mcp.listTools();
  const log = __requestLog();
  const saw404 = log.some((entry) => entry.statusCode === 404);
  const secondSession = mcp.getSessionId();
  report('S7 会话过期 → 重建会话重试', saw404 && tools.length > 0 && secondSession && secondSession !== firstSession,
    `404命中=${saw404} 会话重建=${secondSession !== firstSession} tools=${tools.length}`);
  __clearInjections();
}

async function scenarioRpcError() {
  const mcp = client();
  const outcome = await expectToolError(mcp.callTool('no_such_tool', {}), 'MCP_RPC_ERROR');
  // SDK 对未知工具返回 isError 文本（非 JSON-RPC error）；客户端应抛带 toolCode 的错误
  const ok = outcome.threw && outcome.code === 'MCP_TOOL_ERROR' && outcome.toolCode;
  report('S8 未知工具 → 工具级错误透传', ok,
    outcome.threw ? `code=${outcome.code} toolCode=${outcome.toolCode}` : '未抛出错误');
}

async function scenarioPrompts() {
  const mcp = client();
  const { prompts } = await mcp.listPrompts();
  const found = (prompts || []).find((p) => p.name === 'bookkeeping-assistant');
  const fetched = await mcp.getPrompt('bookkeeping-assistant');
  const ok = Boolean(found)
    && fetched.text.length > 0
    && fetched.text.includes('bookkeeping_create')
    && fetched.text.includes('上个月');
  report('S10 远程提示词 prompts/list + prompts/get', ok,
    found ? `prompts=${prompts.length} 文本长度=${fetched.text.length}` : '未找到 bookkeeping-assistant');
}

async function scenarioDynamicTools() {
  const { loadMcpToolDefinitions, loadMcpPrompt } = await import('../../services/mcp-tools.js');
  const definitions = await loadMcpToolDefinitions({ endpointUrl: VERIFY_URL });
  const names = definitions.map((tool) => tool.function.name);
  const promptText = await loadMcpPrompt('bookkeeping-assistant', { endpointUrl: VERIFY_URL });
  const ok = definitions.length >= 5
    && names.includes('bookkeeping_create')
    && names.includes('bookkeeping_summary')
    && names.includes('bookkeeping_plan')
    && definitions.every((tool) => tool.function.parameters && tool.function.parameters.type === 'object')
    && promptText.includes('bookkeeping_create');
  report('S11 动态工具声明 LanguageModel 格式 + 远程提示词加载', ok,
    `tools=${definitions.length} (${names.join('/')}) prompt=${promptText.length}字`);
}

async function scenarioPlan() {
  const mcp = client();
  const now = new Date();
  const lastMonth = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  const lastMonthYear = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();

  // 1) 上月查询 → summary + 精确 year/month（不再默认本月）
  const summaryPlan = await mcp.callTool('bookkeeping_plan', { input: '上个月花了多少钱' });
  const summaryOk = summaryPlan.action === 'summary'
    && summaryPlan.args.period === 'month'
    && summaryPlan.args.month === lastMonth
    && summaryPlan.args.year === lastMonthYear;

  // 2) 记一笔 → create + 金额/流向/分类
  const createPlan = await mcp.callTool('bookkeeping_plan', { input: '记一笔午餐28.5元' });
  const createOk = createPlan.action === 'create'
    && createPlan.args.amount === 28.5
    && createPlan.args.flow === 'expense'
    && createPlan.args.category === '餐饮'
    && createPlan.args.idempotencyKey;

  // 3) 按 plan 参数执行 summary（模拟眼镜端预路由执行）→ 上月数据可查
  const executed = await mcp.callTool('bookkeeping_summary', summaryPlan.args);
  const executeOk = executed.period === 'month'
    && executed.month === lastMonth
    && executed.year === lastMonthYear;

  // 4) 非记账话术 → action=none + reply
  const nonePlan = await mcp.callTool('bookkeeping_plan', { input: '今天天气不错' });
  const noneOk = nonePlan.action === 'none' && nonePlan.reply.length > 0;

  report('S12 远程意图解析 bookkeeping_plan（上月/记一笔/非记账）',
    summaryOk && createOk && executeOk && noneOk,
    `summary(${summaryPlan.args.year}-${summaryPlan.args.month}) create(${createPlan.args.amount}/${createPlan.args.flow}/${createPlan.args.category}) none=${noneOk}`);
}

async function main() {
  console.log(`MCP 验证目标: ${VERIFY_URL}`);
  console.log(`使用 token: ${VERIFY_TOKEN ? VERIFY_TOKEN.slice(0, 24) + '…' : '（空）'}\n`);

  if (!VERIFY_TOKEN) {
    report('前置 MCP_VERIFY_TOKEN', false, '未设置 MCP_VERIFY_TOKEN（先启动 standalone_mcp_server.py）');
    printReport();
    process.exit(1);
  }

  seedTokenBundle(VERIFY_TOKEN);

  try {
    const created = await scenarioCreate().catch((error) => {
      report('S2 工具执行 bookkeeping_create', false, describeMcpError(error));
      return null;
    });
    await scenarioDiscovery();
    await scenarioCreateInvalid();
    await scenarioSummary();
    await scenarioList();
    await scenarioAuthRefresh();
    await scenarioSessionExpiry();
    await scenarioRpcError();
    await scenarioPrompts();
    await scenarioDynamicTools();
    await scenarioPlan();

    const tokenStillValid = await getValidAccessToken();
    report('S9 绑定 token 仍有效', tokenStillValid === VERIFY_TOKEN, '');
  } catch (error) {
    report('未预期异常', false, error && error.message ? error.message : String(error));
  }

  printReport();
  process.exit(failed === 0 ? 0 : 1);
}

function printReport() {
  console.log(`\n===== MCP Apps 验证结果：${failed === 0 ? '全部通过' : `${failed} 项失败`} =====`);
  results.forEach((result) => {
    console.log(`${result.ok ? 'PASS' : 'FAIL'}  ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
  });
}

main();
