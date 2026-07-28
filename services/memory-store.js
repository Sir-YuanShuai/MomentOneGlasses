import wx from 'wx';

const STORAGE_KEY = 'moment-one:moments:v1';
const MAX_LOCAL_MOMENTS = 120;

const CATEGORY_TERMS = {
  experience: ['体验', '生活', '日常', '发生', '这一刻'],
  habit: ['习惯', '坚持', '连续', '跑步', '运动', '晨跑', '锻炼'],
  travel: ['旅行', '旅游', '城市', '去了', '到过', '出发', '风景'],
  food: ['美食', '吃', '餐厅', '咖啡', '早餐', '午餐', '晚餐', '味道'],
  growth: ['成长', '学习', '完成', '进步', '灵感', '工作', '读书'],
  emotion: ['情绪', '心情', '开心', '难过', '焦虑', '平静', '感受'],
};

function readAll() {
  try {
    const stored = wx.getStorageSync(STORAGE_KEY);
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    console.warn('Moment storage unavailable:', error);
    return [];
  }
}

function writeAll(moments) {
  wx.setStorageSync(STORAGE_KEY, moments.slice(0, MAX_LOCAL_MOMENTS));
}

function timestampOf(moment) {
  const value = Date.parse(moment.occurredAt || moment.timestamp || '');
  return Number.isNaN(value) ? 0 : value;
}

export function listMoments() {
  return readAll().sort((a, b) => timestampOf(b) - timestampOf(a));
}

export function saveMoment(moment) {
  const moments = readAll().filter((item) => item.id !== moment.id);
  moments.unshift(moment);
  moments.sort((a, b) => timestampOf(b) - timestampOf(a));
  writeAll(moments);
  return moment;
}

export function getMoment(momentId) {
  return readAll().find((moment) => moment.id === momentId) || null;
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

  Object.keys(CATEGORY_TERMS).forEach((category) => {
    const aliases = CATEGORY_TERMS[category];
    if (aliases.some((alias) => normalized.indexOf(alias) >= 0)) {
      terms.push(category, ...aliases);
    }
  });

  return Array.from(new Set(terms.filter(Boolean)));
}

function scoreMoment(moment, queryTerms, index) {
  const text = searchableText(moment);
  let score = Math.max(0, 1 - index * 0.01);

  queryTerms.forEach((term) => {
    if (term && text.indexOf(term) >= 0) {
      score += term.length > 2 ? 4 : 2;
    }
  });

  const categoryAliases = CATEGORY_TERMS[moment.category] || [];
  if (categoryAliases.some((alias) => queryTerms.some((term) => term.indexOf(alias) >= 0))) {
    score += 3;
  }

  return score;
}

export function searchMoments(query, limit = 6) {
  const moments = listMoments();
  const terms = expandQuery(query);

  if (!String(query || '').trim()) {
    return moments.slice(0, limit);
  }

  return moments
    .map((moment, index) => ({ moment, score: scoreMoment(moment, terms, index) }))
    .filter((entry) => entry.score > 1)
    .sort((a, b) => b.score - a.score || timestampOf(b.moment) - timestampOf(a.moment))
    .slice(0, limit)
    .map((entry) => entry.moment);
}

export function clearMoments() {
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to clear moments:', error);
  }
}
