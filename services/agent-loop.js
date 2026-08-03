import { LanguageModel } from 'language-model';
import { TOOL_PLANNER_PROMPT } from '../prompts/tool-planner-v1.js';
import { fallbackRecognizeIntent } from './intent-router.js';
import { createTurnTrace, emitAgentTrace } from './agent-trace.js';
import { getToolDefinitions, resolveToolCall } from './tools/registry.js';

function fallbackPlan(utterance, turn, reason) {
  const intent = fallbackRecognizeIntent(utterance);
  emitAgentTrace(turn, 'intent.fallback', {
    reason,
    intentType: intent.type,
    source: intent.source,
  });
  return { intent, turnId: turn.turnId, source: 'rules-fallback' };
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

  let session;
  try {
    if ((await LanguageModel.availability()) !== 'available') {
      return fallbackPlan(input, turn, 'language-model-unavailable');
    }

    const calls = [];
    session = await LanguageModel.create({
      initialPrompts: [{ role: 'system', content: TOOL_PLANNER_PROMPT.system }],
      tools: getToolDefinitions(),
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
      toolCount: getToolDefinitions().length,
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

    const resolved = resolveToolCall(calls[0], input);
    if (!resolved.ok) {
      emitAgentTrace(turn, 'tool.rejected', { toolName: calls[0].name, reason: resolved.error });
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
      toolName: calls[0].name,
      intentType: resolved.intent.type,
    });
    return {
      intent: resolved.intent,
      toolCall: calls[0],
      turnId: turn.turnId,
      source: 'language-model-tool',
    };
  } catch (error) {
    console.warn('Tool planner fallback:', error);
    emitAgentTrace(turn, 'model.failed', { message: String(error && error.message ? error.message : error) });
    return fallbackPlan(input, turn, 'tool-planner-error');
  } finally {
    if (session) session.destroy();
  }
}
