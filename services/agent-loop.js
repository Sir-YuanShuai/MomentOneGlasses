// 远程 MCP Agent loop（不依赖设备端模型工具规划）。
// 首选链路：tools/list 动态发现 → Server agent_plan → 校验并执行所选工具。
// 兼容链路：旧 Server 无 agent_plan 时继续使用 bookkeeping_plan。
// 工具结果保留完整 CallToolResult，供 A2UI / 文本 / structuredContent 分层展示。
import { createTurnTrace, emitAgentTrace } from './agent-trace.js';
import { createMcpClient } from './mcp-client.js';
import { looksLikeBookkeeping } from './bookkeeping-gate.js';

export { looksLikeBookkeeping };

function mcpResultIntent(toolName, toolArguments, toolResult) {
  const envelope = toolResult || {};
  const structuredContent = envelope.structuredContent !== undefined
    ? envelope.structuredContent
    : envelope;
  return {
    type: 'mcp.tool.result',
    toolName,
    toolArguments: toolArguments || {},
    result: structuredContent,
    toolResult: envelope,
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
      intent: replyIntent('请直接说想做什么，例如记账、查账、查看记录或习惯进度。'),
      turnId: turn.turnId,
      source: 'mcp-agent-plan',
    };
  }

  let mcpClient = null;
  try {
    mcpClient = createMcpClient();
    const discovery = await mcpClient.listTools();
    const tools = discovery && Array.isArray(discovery.tools) ? discovery.tools : [];
    const toolNames = tools.map((tool) => String(tool && tool.name || '')).filter(Boolean);
    emitAgentTrace(turn, 'mcp.tools.discovered', { count: toolNames.length });

    // Preferred generic route: Server owns planning and can add tools without
    // an AIX release. The client validates the selected tool against tools/list
    // before executing it.
    if (toolNames.includes('agent_plan')) {
      const plan = await mcpClient.callTool('agent_plan', { input });
      const toolName = String(plan.toolName || plan.tool || '');
      const args = plan.arguments && typeof plan.arguments === 'object'
        ? plan.arguments
        : (plan.args && typeof plan.args === 'object' ? plan.args : {});
      emitAgentTrace(turn, 'agent.plan', { toolName, args: JSON.stringify(args) });

      if (!toolName) {
        return {
          intent: replyIntent(String(plan.reply || '没有识别到可执行的操作，请再说一遍。')),
          turnId: turn.turnId,
          source: 'mcp-agent-plan',
        };
      }
      if (toolName === 'agent_plan' || !toolNames.includes(toolName)) {
        throw new Error(`Server planner selected an unavailable tool: ${toolName}`);
      }
      const result = await mcpClient.callToolResult(toolName, args);
      return { intent: mcpResultIntent(toolName, args, result), turnId: turn.turnId, source: 'mcp-agent-plan' };
    }

    // Compatibility path for the currently deployed bookkeeping-only Server.
    if (!looksLikeBookkeeping(input) || !toolNames.includes('bookkeeping_plan')) {
      return {
        intent: replyIntent('当前服务暂未开放这项能力，可以先试试记账、查账或账单统计。'),
        turnId: turn.turnId,
        source: 'bookkeeping-plan',
      };
    }

    const plan = await mcpClient.callTool('bookkeeping_plan', { input });
    const action = String(plan.action || 'none');
    const args = plan.args && typeof plan.args === 'object' ? plan.args : {};
    const actionTools = {
      summary: 'bookkeeping_summary',
      create: 'bookkeeping_create',
      list: 'bookkeeping_list'
    };
    const toolName = actionTools[action] || '';
    emitAgentTrace(turn, 'bookkeeping.plan', { action, args: JSON.stringify(args) });

    if (!toolName) {
      return {
        intent: replyIntent(String(plan.reply || '没有识别到记账意图，请再说一遍。')),
        turnId: turn.turnId,
        source: 'bookkeeping-plan',
      };
    }
    if (!toolNames.includes(toolName)) throw new Error(`MCP tool is unavailable: ${toolName}`);
    const result = await mcpClient.callToolResult(toolName, args);
    return { intent: mcpResultIntent(toolName, args, result), turnId: turn.turnId, source: 'bookkeeping-plan' };
  } catch (error) {
    console.error('[moment-one:mcp] agent turn failed:', error);
    const message = (error && error.code === 'MCP_AUTH_REQUIRED')
      ? '登录状态已失效，请重新扫码绑定账号。'
      : '服务暂时不可用，请检查网络后重试。';
    return { intent: replyIntent(message), turnId: turn.turnId, source: 'mcp-agent-plan' };
  } finally {
    if (mcpClient) mcpClient.reset();
  }
}
