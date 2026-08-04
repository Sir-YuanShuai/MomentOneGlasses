import { fallbackRecognizeIntent } from '../intent-router.js';
import { MOMENT_TOOL_DEFINITIONS } from './definitions.js';

const TOOL_NAMES = new Set(MOMENT_TOOL_DEFINITIONS.map((tool) => tool.function.name));
const CATEGORIES = new Set(['experience', 'habit', 'travel', 'food', 'growth', 'emotion']);

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeChanges(value) {
  const source = asObject(value);
  const changes = {};
  ['title', 'locationName', 'occurredAt', 'description', 'aiSummary', 'replacementText'].forEach((key) => {
    const normalized = text(source[key]);
    if (normalized) changes[key] = normalized;
  });
  if (CATEGORIES.has(source.category)) changes.category = source.category;
  if (Array.isArray(source.tags)) {
    changes.tags = Array.from(new Set(source.tags.map((tag) => text(tag)).filter(Boolean))).slice(0, 5);
  }
  return changes;
}

function invalid(message) {
  return { ok: false, error: message };
}

export function getToolDefinitions() {
  return MOMENT_TOOL_DEFINITIONS;
}

export function resolveToolCall(call, utterance) {
  const name = text(call && call.name);
  if (!TOOL_NAMES.has(name)) return invalid(`未知工具：${name || '空'}`);
  const args = asObject(call && call.arguments);
  const fallback = fallbackRecognizeIntent(utterance);

  if (name === 'moment_create') {
    const content = text(args.content);
    if (!content) return invalid('moment_create 缺少 content');
    if (fallback.type !== 'moment.create') return invalid('没有识别为可记录的个人生活 Moment');
    return {
      ok: true,
      intent: {
        type: 'moment.create',
        content: fallback.content || content,
        source: 'language-model-tool',
      },
    };
  }

  if (name === 'moment_search') {
    const query = text(args.query) || String(utterance || '').trim();
    if (!query) return invalid('moment_search 缺少 query');
    return {
      ok: true,
      intent: {
        type: 'moment.query',
        query,
        mode: ['search', 'count', 'review', 'summary'].includes(args.mode) ? args.mode : 'search',
        timeRange: text(args.timeRange) || 'unspecified',
        source: 'language-model-tool',
      },
    };
  }

  if (name === 'moment_update') {
    const query = text(args.targetReference);
    const changes = normalizeChanges(args.changes);
    if (!query) return invalid('moment_update 缺少 targetReference');
    if (!Object.keys(changes).length) return invalid('moment_update 没有可执行的 changes');
    return { ok: true, intent: { type: 'moment.update', query, changes, source: 'language-model-tool' } };
  }

  if (name === 'moment_delete_request') {
    const query = text(args.targetReference);
    if (!query) return invalid('moment_delete_request 缺少 targetReference');
    if (fallback.type !== 'moment.delete') return invalid('用户没有明确要求删除 Moment');
    return {
      ok: true,
      intent: {
        type: 'moment.delete',
        query: fallback.query || query,
        source: 'language-model-tool',
      },
    };
  }

  if (name === 'moment_clear_request') {
    if (fallback.type !== 'moment.clear') return invalid('用户没有明确要求清空全部 Moment');
    return { ok: true, intent: { type: 'moment.clear', source: 'language-model-tool' } };
  }

  if (name === 'config_get') {
    return {
      ok: true,
      intent: {
        type: 'config.get',
        configKey: args.key === 'instant_memory' ? 'instant_memory' : '',
        source: 'language-model-tool',
      },
    };
  }

  if (name === 'config_set') {
    if (args.key !== 'instant_memory' || typeof args.value !== 'boolean') {
      return invalid('config_set 参数无效');
    }
    if (fallback.type !== 'config.set') return invalid('用户没有明确要求修改配置');
    if (typeof fallback.configValue === 'boolean' && fallback.configValue !== args.value) {
      return invalid('模型配置值与用户原话冲突');
    }
    return {
      ok: true,
      intent: {
        type: 'config.set',
        configKey: 'instant_memory',
        configValue: args.value,
        source: 'language-model-tool',
      },
    };
  }

  return invalid(`未处理工具：${name}`);
}
