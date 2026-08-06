// 记账预路由（纯 MCP 客户端模式，不依赖设备 LLM / 本地能力）。
//
// 链路：话术 → 记账门槛 → 远程 bookkeeping_plan（确定性解析）
//   → 按 action 执行远程工具（summary / create / list）
//   → 返回 mcp.tool.result 意图，由 index 渲染卡片/结果。
// 非记账话术返回 mcp.plan.reply 提示。
import { createTurnTrace, emitAgentTrace } from './agent-trace.js';
import { createMcpClient } from './mcp-client.js';
import { looksLikeBookkeeping } from './bookkeeping-gate.js';

export { looksLikeBookkeeping };

function mcpResultIntent(toolName, toolArguments, structuredContent) {
  return {
    type: 'mcp.tool.result',
    toolName,
    toolArguments: toolArguments || {},
    result: structuredContent,
    ok: true,
    confidence: 1,
    source: 'mcp-plan',
  };
}

function replyIntent(reply) {
  return {
    type: 'mcp.plan.reply',
    reply: String(reply || ''),
    confidence: 1,
    source: 'bookkeeping-plan',
  };
}

export async function runAgentTurn({ utterance }) {
  const input = String(utterance || '').trim();
  const turn = createTurnTrace(input);
  emitAgentTrace(turn, 'turn.received', { utteranceLength: input.length });

  if (!input) {
    return {
      intent: replyIntent('请直接说想做什么，例如「记一笔午餐 28.5 元」或「上个月花了多少」。'),
      turnId: turn.turnId,
      source: 'bookkeeping-plan',
    };
  }

  // 非记账话术：直接提示（本版本只保留 MCP 记账能力）
  if (!looksLikeBookkeeping(input)) {
    return {
      intent: replyIntent('当前只支持记账相关操作。可以试试「记一笔午餐 28.5 元」「上个月花了多少」或「看看这个月的账单」。'),
      turnId: turn.turnId,
      source: 'bookkeeping-plan',
    };
  }

  let mcpClient = null;
  try {
    mcpClient = createMcpClient();
    const plan = await mcpClient.callTool('bookkeeping_plan', { input });
    const action = String(plan.action || 'none');
    const args = plan.args && typeof plan.args === 'object' ? plan.args : {};
    emitAgentTrace(turn, 'bookkeeping.plan', { action, args: JSON.stringify(args) });

    if (action === 'none') {
      return {
        intent: replyIntent(String(plan.reply || '没有识别到记账意图，请再说一遍。')),
        turnId: turn.turnId,
        source: 'bookkeeping-plan',
      };
    }
    if (action === 'summary') {
      const result = await mcpClient.callTool('bookkeeping_summary', args);
      return { intent: mcpResultIntent('bookkeeping_summary', args, result), turnId: turn.turnId, source: 'bookkeeping-plan' };
    }
    if (action === 'create') {
      const result = await mcpClient.callTool('bookkeeping_create', args);
      return { intent: mcpResultIntent('bookkeeping_create', args, result), turnId: turn.turnId, source: 'bookkeeping-plan' };
    }
    if (action === 'list') {
      const result = await mcpClient.callTool('bookkeeping_list', args);
      return { intent: mcpResultIntent('bookkeeping_list', args, result), turnId: turn.turnId, source: 'bookkeeping-plan' };
    }
    return { intent: replyIntent('没有识别到记账意图，请再说一遍。'), turnId: turn.turnId, source: 'bookkeeping-plan' };
  } catch (error) {
    console.error('[moment-one:mcp] bookkeeping plan failed:', error);
    const message = (error && error.code === 'MCP_AUTH_REQUIRED')
      ? '登录状态已失效，请重新扫码绑定账号。'
      : '记账服务暂时不可用，请检查网络后重试。';
    return { intent: replyIntent(message), turnId: turn.turnId, source: 'bookkeeping-plan' };
  } finally {
    if (mcpClient) mcpClient.reset();
  }
}
