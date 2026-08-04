const DEFAULT_MAX_LOCAL_MOMENTS = 120;

const CATEGORY_TERMS = {
  experience: ['体验', '生活', '日常', '发生', '这一刻'],
  habit: ['习惯', '坚持', '连续', '跑步', '运动', '晨跑', '锻炼'],
  travel: ['旅行', '旅游', '城市', '去了', '去过', '到过', '出发', '风景'],
  food: ['美食', '吃', '餐厅', '咖啡', '早餐', '午餐', '晚餐', '味道', '面馆', '面', '饭'],
  growth: ['成长', '学习', '完成', '进步', '灵感', '工作', '读书'],
  emotion: ['情绪', '心情', '开心', '难过', '焦虑', '平静', '感受'],
};

function timestampOf(moment) {
  const value = Date.parse(moment.occurredAt || moment.timestamp || moment.createdAt || '');
  return Number.isNaN(value) ? 0 : value;
}

function searchableText(moment) {
  return [
    moment.title,
    moment.voiceInput,
    moment.description,
    moment.aiSummary,
    moment.category,
    moment.categoryLabel,
    moment.location && moment.location.name,
    moment.emotion && moment.emotion.label,
    ...(Array.isArray(moment.tags) ? moment.tags : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function expandQuery(query) {
  const normalized = String(query || '').trim().toLowerCase();
  const terms = [normalized];
  const simplified = normalized
    .replace(/请|帮我|麻烦|查一下|查询|搜索|查看|看看|找找|回顾|总结|我|的|记录|记忆/g, ' ')
    .replace(/今天|昨天|本周|这周|上周|最近|这几天/g, ' ')
    .split(/[\s，,。！？!?、]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
  terms.push(...simplified);

  Object.keys(CATEGORY_TERMS).forEach((category) => {
    const aliases = CATEGORY_TERMS[category];
    if (aliases.some((alias) => normalized.indexOf(alias) >= 0)) {
      terms.push(category, ...aliases);
    }
  });

  return Array.from(new Set(terms.filter(Boolean)));
}

function scoreMoment(moment, queryTerms, index) {
  const haystack = searchableText(moment);
  let score = Math.max(0, 1 - index * 0.01);

  queryTerms.forEach((term) => {
    if (term && haystack.indexOf(term) >= 0) score += term.length > 2 ? 4 : 2;
  });

  const categoryAliases = CATEGORY_TERMS[moment.category] || [];
  if (categoryAliases.some((alias) => queryTerms.some((term) => term.indexOf(alias) >= 0))) {
    score += 3;
  }

  return score;
}

export function createMemoryRepository({
  storage,
  storageKey = 'moment-one:moments:v1',
  maxMoments = DEFAULT_MAX_LOCAL_MOMENTS,
  now = () => new Date().toISOString(),
  logger = console,
}) {
  if (!storage) throw new Error('Memory repository requires a storage adapter');

  function readAll() {
    try {
      const stored = storage.getStorageSync(storageKey);
      return Array.isArray(stored) ? stored : [];
    } catch (error) {
      logger.warn('Moment storage unavailable:', error);
      return [];
    }
  }

  function writeAll(moments) {
    storage.setStorageSync(storageKey, moments.slice(0, maxMoments));
  }

  function listMoments() {
    return readAll().slice().sort((a, b) => timestampOf(b) - timestampOf(a));
  }

  function saveMoment(moment) {
    if (!moment || !moment.id) throw new Error('Moment id is required');
    const moments = readAll().filter((item) => item.id !== moment.id);
    moments.unshift(moment);
    moments.sort((a, b) => timestampOf(b) - timestampOf(a));
    writeAll(moments);
    return moment;
  }

  function getMoment(momentId) {
    return readAll().find((moment) => moment.id === momentId) || null;
  }

  function deleteMoment(momentId) {
    const moments = readAll();
    const remaining = moments.filter((moment) => moment.id !== momentId);
    if (remaining.length === moments.length) return false;
    writeAll(remaining);
    return true;
  }

  function updateMoment(momentId, changes) {
    const moments = readAll();
    const index = moments.findIndex((moment) => moment.id === momentId);
    if (index < 0) return null;
    const existing = moments[index];
    const updated = {
      ...existing,
      ...(changes && typeof changes === 'object' ? changes : {}),
      id: existing.id,
      revision: (existing.revision ?? 0) + 1,
      syncState: 'pending',
      updatedAt: now(),
    };
    moments[index] = updated;
    writeAll(moments);
    return updated;
  }

  function searchMoments(query, limit = 6) {
    const moments = listMoments();
    const normalizedLimit = Math.max(0, Number(limit) || 0);
    const terms = expandQuery(query);

    if (!String(query || '').trim()) return moments.slice(0, normalizedLimit);

    return moments
      .map((moment, index) => ({ moment, score: scoreMoment(moment, terms, index) }))
      .filter((entry) => entry.score > 1)
      .sort((a, b) => b.score - a.score || timestampOf(b.moment) - timestampOf(a.moment))
      .slice(0, normalizedLimit)
      .map((entry) => entry.moment);
  }

  function clearMoments() {
    const count = readAll().length;
    try {
      storage.removeStorageSync(storageKey);
    } catch (error) {
      logger.warn('Unable to clear moments:', error);
    }
    return count;
  }

  return {
    listMoments,
    saveMoment,
    getMoment,
    deleteMoment,
    updateMoment,
    searchMoments,
    clearMoments,
  };
}
