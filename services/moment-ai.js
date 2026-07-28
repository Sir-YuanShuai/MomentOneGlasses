import { LanguageModel } from 'language-model';
import { CATEGORY_META } from './format.js';

const ALLOWED_CATEGORIES = Object.keys(CATEGORY_META);

export const MOMENT_SYSTEM_PROMPT = `你是一名个人 AI 记忆助手。你的任务是帮助用户忠实记录人生瞬间。
只根据用户语音、画面、时间和地点提取事实，不臆造人物身份、精确地点、背景或感受。
category 只能是 experience、habit、travel、food、growth、emotion 之一。
tags 必须是 2 到 5 个简短中文词语。title 不超过 20 个中文字符，aiSummary 不超过 80 个中文字符。
仅输出 JSON，不要输出 Markdown 或解释。JSON 字段必须为 title、category、tags、emotion、description、aiSummary、confidence。`;

const SEARCH_SYSTEM_PROMPT = `你是用户的个人记忆助手。只能依据提供的 Moment 证据回答问题，不得补充证据之外的事实。
证据不足时明确说“暂未找到足够的记录”。回答要简洁、温和，并优先提到可辨认的时间、地点和事件。`;

function cleanJsonText(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
}

function normalizeTags(tags, fallbackTags) {
  const values = Array.isArray(tags) ? tags : fallbackTags;
  return Array.from(
    new Set(values.map((tag) => String(tag || '').trim()).filter(Boolean)),
  ).slice(0, 5);
}

function inferCategory(text) {
  const value = String(text || '');
  if (/旅行|旅游|城市|景点|出发|京都|樱花|海边|山/.test(value)) return 'travel';
  if (/吃|餐|咖啡|味道|美食|早餐|午餐|晚餐|面|饭/.test(value)) return 'food';
  if (/跑步|运动|健身|坚持|连续|习惯|打卡/.test(value)) return 'habit';
  if (/学习|读书|完成|进步|灵感|成长|工作/.test(value)) return 'growth';
  if (/开心|难过|焦虑|平静|情绪|心情|感动/.test(value)) return 'emotion';
  return 'experience';
}

function fallbackTags(category, voiceInput) {
  const tags = [CATEGORY_META[category].label];
  const rules = [
    ['旅行', /旅行|旅游|城市|出发|景点/],
    ['美食', /吃|餐|咖啡|味道|面|饭/],
    ['运动', /跑步|运动|健身|锻炼/],
    ['坚持', /坚持|连续|习惯/],
    ['灵感', /灵感|想法|创意/],
    ['开心', /开心|高兴|快乐|感动/],
    ['平静', /平静|放松|安静/],
  ];
  rules.forEach(([tag, pattern]) => {
    if (pattern.test(voiceInput)) tags.push(tag);
  });
  if (tags.length < 2) tags.push('今日记录');
  return Array.from(new Set(tags)).slice(0, 5);
}

function shortTitle(voiceInput, category) {
  const cleaned = String(voiceInput || '')
    .replace(/[，。！？,.!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned) return cleaned.slice(0, 20);
  return `${CATEGORY_META[category].label}的一刻`;
}

export function fallbackAnalyze(input) {
  const voiceInput = String(input.voiceInput || '').trim();
  const category = inferCategory(voiceInput);
  const locationName = input.location && input.location.name;
  const description = voiceInput || (input.hasImage ? '记录了当前第一视角画面。' : '记录了当前时刻。');
  const locationSuffix = locationName ? `，地点是${locationName}` : '';

  return {
    title: shortTitle(voiceInput, category),
    category,
    tags: fallbackTags(category, voiceInput),
    emotion: {
      label: /开心|高兴|快乐|感动/.test(voiceInput) ? '开心' : '平静',
      valence: /开心|高兴|快乐|感动/.test(voiceInput) ? 0.7 : 0,
      arousal: /兴奋|激动/.test(voiceInput) ? 0.7 : 0.2,
    },
    description,
    aiSummary: `${description}${locationSuffix}`.slice(0, 80),
    confidence: voiceInput ? 0.58 : 0.35,
    aiMode: 'fallback',
  };
}

function normalizeAnalysis(value, input) {
  const fallback = fallbackAnalyze(input);
  const category = ALLOWED_CATEGORIES.indexOf(value.category) >= 0
    ? value.category
    : fallback.category;
  const confidence = Number(value.confidence);

  return {
    title: String(value.title || fallback.title).trim().slice(0, 20),
    category,
    tags: normalizeTags(value.tags, fallback.tags),
    emotion: {
      label: String((value.emotion && value.emotion.label) || fallback.emotion.label).slice(0, 12),
      valence: Number((value.emotion && value.emotion.valence) ?? fallback.emotion.valence),
      arousal: Number((value.emotion && value.emotion.arousal) ?? fallback.emotion.arousal),
    },
    description: String(value.description || fallback.description).trim().slice(0, 240),
    aiSummary: String(value.aiSummary || fallback.aiSummary).trim().slice(0, 80),
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : fallback.confidence,
    aiMode: 'language-model',
  };
}

async function createSession(systemPrompt) {
  if ((await LanguageModel.availability()) !== 'available') return null;
  return LanguageModel.create({
    initialPrompts: [{ role: 'system', content: systemPrompt }],
  });
}

export async function analyzeMoment(input) {
  let session;
  try {
    session = await createSession(MOMENT_SYSTEM_PROMPT);
    if (!session) return fallbackAnalyze(input);

    const context = `请生成一个结构化 Moment。\n时间：${input.timestamp}\n地点：${
      input.location && input.location.name ? input.location.name : '未知'
    }\n用户语音：${input.voiceInput || '未识别到语音'}\n输出严格 JSON。`;

    const content = [{ type: 'text', text: context }];
    if (input.imageDataUrl) {
      content.push({ type: 'image_url', image_url: { url: input.imageDataUrl } });
    }

    const result = await session.prompt([
      { role: 'user', content },
    ]);
    return normalizeAnalysis(JSON.parse(cleanJsonText(result)), input);
  } catch (error) {
    console.warn('Moment understanding fallback:', error);
    return fallbackAnalyze(input);
  } finally {
    if (session) session.destroy();
  }
}

function compactEvidence(moments) {
  return moments.map((moment) => ({
    id: moment.id,
    occurredAt: moment.occurredAt,
    title: moment.title,
    category: moment.category,
    tags: moment.tags,
    location: moment.location && moment.location.name,
    voiceInput: moment.voiceInput,
    aiSummary: moment.aiSummary,
  }));
}

function fallbackAnswer(question, moments) {
  if (!moments.length) return '暂未找到足够的记录。你可以先记录几个生活瞬间，再来问我。';
  const titles = moments.slice(0, 3).map((moment) => moment.title).join('、');
  return `我找到了 ${moments.length} 条相关记忆：${titles}。`;
}

export async function answerMemoryQuestion(question, moments) {
  if (!moments.length) return fallbackAnswer(question, moments);

  let session;
  try {
    session = await createSession(SEARCH_SYSTEM_PROMPT);
    if (!session) return fallbackAnswer(question, moments);

    const answer = await session.prompt(
      `用户问题：${question}\nMoment 证据：${JSON.stringify(compactEvidence(moments))}\n请直接回答，不要输出 JSON。`,
    );
    return String(answer || '').trim() || fallbackAnswer(question, moments);
  } catch (error) {
    console.warn('Memory answer fallback:', error);
    return fallbackAnswer(question, moments);
  } finally {
    if (session) session.destroy();
  }
}
