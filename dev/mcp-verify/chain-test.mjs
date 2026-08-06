// 记账整链路验证：话术 → 远程 bookkeeping_plan → 远程工具执行（纯 MCP，
// 不依赖设备 LLM / 本地存储）。非记账话术返回远程提示话术。
//
// 运行（需 standalone server 已启动）：
//   MCP_VERIFY_TOKEN=<token> node --import ./dev/mcp-verify/register.mjs \
//     ./dev/mcp-verify/chain-test.mjs
import { runAgentTurn } from '../../services/agent-loop.js';
import { __seedStorage, __redirectUrl } from './wx-shim.mjs';

const VERIFY_URL = process.env.MCP_VERIFY_URL || 'http://127.0.0.1:8765/mcp';
const VERIFY_TOKEN = process.env.MCP_VERIFY_TOKEN || '';
let failed = 0;

function report(name, ok, detail) {
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

// 生产 MCP 端点 → standalone（agent-loop 内部用 config.js 的生产地址）
__redirectUrl('https://moment-one-api.yuanshuai.fun/mcp', VERIFY_URL);

function seedToken() {
  __seedStorage({
    deviceId: 'chain-test-device',
    bindingId: '22222222-2222-4222-8222-222222222222',
    accessToken: VERIFY_TOKEN,
    refreshToken: 'chain-test-refresh',
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    refreshTokenExpiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
  });
}

async function main() {
  if (!VERIFY_TOKEN) {
    console.error('MCP_VERIFY_TOKEN 未设置');
    process.exit(1);
  }
  seedToken();

  const now = new Date();
  const lastMonth = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth();
  const lastMonthYear = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();

  // 1) 上月查询：预路由拦截（LLM 未被调用）→ summary 精确到上月
  const summaryTurn = await runAgentTurn({ utterance: '上个月花了多少钱' });
  report('链路 上月查询 → plan → summary(上月参数)',
    summaryTurn.intent && summaryTurn.intent.type === 'mcp.tool.result'
      && summaryTurn.intent.toolName === 'bookkeeping_summary'
      && summaryTurn.intent.result.month === lastMonth
      && summaryTurn.intent.result.year === lastMonthYear,
    `month=${summaryTurn.intent && summaryTurn.intent.result && summaryTurn.intent.result.month} 来源=${summaryTurn.source}`);

  // 2) 记一笔：预路由 → create 真实落库（返回 id）
  const createTurn = await runAgentTurn({ utterance: '记一笔午餐28.5元' });
  report('链路 记一笔 → plan → create(落库)',
    createTurn.intent && createTurn.intent.type === 'mcp.tool.result'
      && createTurn.intent.toolName === 'bookkeeping_create'
      && createTurn.intent.ok === true
      && createTurn.intent.result.id && createTurn.intent.result.amount === 28.5,
    `id=${createTurn.intent && createTurn.intent.result && createTurn.intent.result.id ? String(createTurn.intent.result.id).slice(0, 8) : '无'}`);

  // 3) 非记账话术：返回远程提示（只支持记账）
  const otherTurn = await runAgentTurn({ utterance: '帮我找找上周吃过的面馆' });
  report('链路 非记账话术 → 提示话术',
    otherTurn.intent && otherTurn.intent.type === 'mcp.plan.reply'
      && String(otherTurn.intent.reply || '').includes('记账'),
    `intent=${otherTurn.intent && otherTurn.intent.type}`);

  console.log(failed === 0 ? '\n===== 整链路验证：全部通过 =====' : `\n===== ${failed} 项失败 =====`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
