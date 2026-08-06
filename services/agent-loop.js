import { LanguageModel } from 'language-model';
import { TOOL_PLANNER_PROMPT } from '../prompts/tool-planner-v1.js';
import { fallbackRecognizeIntent } from './intent-router.js';
import { createTurnTrace, emitAgentTrace } from './agent-trace.js';
import { getToolDefinitions, resolveToolCall } from './tools/registry.js';
import { createMcpClient } from './mcp-client.js';
import { isMcpToolName, toLanguageModelTools } from './mcp-tools.js';

// 远程记账提示词名称（Server MCP prompts/list）
const REMOTE_PROMPT_NAME = 'bookkeeping-assistant';

function fallbackPlan(utterance, turn, reason) {
  const intent = fallbackRecognizeIntent(utterance);
  emitAgentTrace(turn, 'intent.fallback', {
    reason,
    intentType: intent.type,
    source: intent.source,
  });
  return { intent, turnId: turn.turnId, source: 'rules-fallback' };
}

function describeCallArguments(raw) {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  return {};
}

// 远程工具 + 提示词发现（失败降级为空，不阻塞本地能力）
async function discoverRemote(mcpClient) {
  let tools = [];
  let mcpToolNames = [];
  let promptText = '';
  try {
    const toolsResult = await mcpClient.listTools();
    tools = toLanguageModelTools(toolsResult.tools);
    mcpToolNames = tools.map((tool) => tool.function.name);
  } catch (error) {
    console.warn('[moment-one:mcp] tool discovery failed, degraded to local only', error);
    emitAgentTrace(null, 'mcp.discovery_failed', {
      message: String(error && error.message ? error.message : error),
    });
  }
  if (tools.length) {
    try {
      const prompt = await mcpClient.getPrompt(REMOTE_PROMPT_NAME);
      promptText = prompt.text || '';
    } catch (error) {
      console.warn(`[moment-one:mcp] prompt "${REMOTE_PROMPT_NAME}" load failed`, error);
    }
  }
  return { tools, mcpToolNames, promptText };
}

function buildSystemPrompt(promptText) {
  const parts = [TOOL_PLANNER_PROMPT.system];
  if (promptText) {
    parts.push(`\n\n【记账助手（远程指令）】\n${promptText}`);
  }
  parts.push(`\n当前时间：${new Date().toISOString()}`);
  return parts.join('').trim();
}

export async function runAgentTurn({ utterance, forcedMode = '' }) {
  const input = String(utterance || '').trim();
  const turn = createTurnTrace(input);
  emitAgentTrace(turn, 'turn.received', { forcedMode, utteranceLength: input.length });

  if (!input) return fallbackPlan(input, turn, 'empty-input');
  if (forcedMode === 'search') {
    const intent = { type: 'moment.query', query: input, confidence: 1, source: 'host' };
    emitAgentTrace(turn, 'intent.forced', { intentType: intent.type });
    return { intent, turnId: turn.turnId, source: 'host' };
  }

  let session = null;
  let mcpClient = null;
  try {
    if ((await LanguageModel.availability()) !== 'available') {
      return fallbackPlan(input, turn, 'language-model-unavailable');
    }

    // 动态声明远程 MCP 工具 + 拉取远程提示词（工具/提示词均来自 Server）
    mcpClient = createMcpClient();
    const remote = await discoverRemote(mcpClient);
    emitAgentTrace(turn, 'mcp.discovered', {
      mcpToolCount: remote.tools.length,
      promptLoaded: Boolean(remote.promptText),
    });

    const calls = [];
    session = await LanguageModel.create({
      initialPrompts: [{ role: 'system', content: buildSystemPrompt(remote.promptText) }],
      tools: [...getToolDefinitions(), ...remote.tools],
    });
    session.addEventListener('toolcall', (event) => {
      calls.push({
        callId: event.callId,
        index: event.index,
        name: event.functionName,
        arguments: event.arguments,
      });
    });

    emitAgentTrace(turn, 'model.requested', {
      promptId: TOOL_PLANNER_PROMPT.id,
      promptVersion: TOOL_PLANNER_PROMPT.version,
      localToolCount: getToolDefinitions().length,
      mcpToolCount: remote.tools.length,
    });
    const modelText = await session.prompt(input);
    emitAgentTrace(turn, 'model.responded', {
      toolCallCount: calls.length,
      textLength: String(modelText || '').length,
    });

    if (!calls.length) {
      const fallback = fallbackRecognizeIntent(input);
      if (fallback.type !== 'unknown' && fallback.type !== 'help') {
        return fallbackPlan(input, turn, 'provider-returned-no-toolcall');
      }
      emitAgentTrace(turn, 'turn.no_tool', { intentType: fallback.type });
      return {
        intent: fallback,
        turnId: turn.turnId,
        source: 'language-model-no-tool',
        modelText: String(modelText || '').trim(),
      };
    }

    if (calls.length > 1) {
      emitAgentTrace(turn, 'tool.rejected', { reason: 'multiple-tool-calls', toolCallCount: calls.length });
      return {
        intent: {
          type: 'unknown',
          confidence: 1,
          reason: '一次只支持一个操作，请拆开表达',
          source: 'tool-policy',
        },
        turnId: turn.turnId,
        source: 'tool-policy',
      };
    }

    const call = calls[0];

    // 远程 MCP 工具：执行并返回结构化结果（记账/查账等）
    if (isMcpToolName(call.name, remote.mcpToolNames)) {
      emitAgentTrace(turn, 'tool.accepted', { toolName: call.name, source: 'mcp' });
      const toolArguments = describeCallArguments(call.arguments);
      try {
        const structuredContent = await mcpClient.callTool(call.name, toolArguments);
        return {
          intent: {
            type: 'mcp.tool.result',
            toolName: call.name,
            toolArguments,
            result: structuredContent,
            ok: true,
            confidence: 1,
            source: 'mcp-tool',
          },
          toolCall: call,
          turnId: turn.turnId,
          source: 'mcp-tool',
        };
      } catch (error) {
        console.error(`[moment-one:mcp] tool "${call.name}" failed:`, error);
        return {
          intent: {
            type: 'mcp.tool.result',
            toolName: call.name,
            toolArguments,
            ok: false,
            errorCode: error && error.code ? error.code : 'MCP_TOOL_ERROR',
            errorMessage: error && error.message ? error.message : '工具执行失败',
            confidence: 1,
            source: 'mcp-tool',
          },
          toolCall: call,
          turnId: turn.turnId,
          source: 'mcp-tool',
        };
      }
    }

    const resolved = resolveToolCall(call, input);
    if (!resolved.ok) {
      emitAgentTrace(turn, 'tool.rejected', { toolName: call.name, reason: resolved.error });
      return {
        intent: {
          type: 'unknown',
          confidence: 1,
          reason: resolved.error,
          source: 'tool-policy',
        },
        turnId: turn.turnId,
        source: 'tool-policy',
      };
    }

    emitAgentTrace(turn, 'tool.accepted', {
      toolName: call.name,
      intentType: resolved.intent.type,
    });
    return {
      intent: resolved.intent,
      toolCall: call,
      turnId: turn.turnId,
      source: 'language-model-tool',
    };
  } catch (error) {
    console.warn('Tool planner fallback:', error);
    emitAgentTrace(turn, 'model.failed', { message: String(error && error.message ? error.message : error) });
    return fallbackPlan(input, turn, 'tool-planner-error');
  } finally {
    if (session) session.destroy();
    if (mcpClient) mcpClient.reset();
  }
}
