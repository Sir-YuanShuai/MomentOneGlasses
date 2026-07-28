export const CATEGORY_META = {
  experience: { label: '生活体验', mark: '刻' },
  habit: { label: '习惯记录', mark: '习' },
  travel: { label: '旅行', mark: '行' },
  food: { label: '美食', mark: '食' },
  growth: { label: '成长', mark: '长' },
  emotion: { label: '情绪', mark: '心' },
};

function pad(value) {
  return String(value).padStart(2, '0');
}

export function formatDateKey(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateLabel(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '未知日期';

  const today = new Date();
  const targetKey = formatDateKey(isoString);
  const todayKey = formatDateKey(today.toISOString());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = formatDateKey(yesterday.toISOString());

  if (targetKey === todayKey) return '今天';
  if (targetKey === yesterdayKey) return '昨天';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatFullTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '时间未知';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function presentMoment(moment, previousDateKey = '') {
  const meta = CATEGORY_META[moment.category] || CATEGORY_META.experience;
  const dateKey = formatDateKey(moment.occurredAt);
  return {
    ...moment,
    categoryLabel: meta.label,
    categoryMark: meta.mark,
    timeLabel: formatTime(moment.occurredAt),
    fullTimeLabel: formatFullTime(moment.occurredAt),
    dateLabel: formatDateLabel(moment.occurredAt),
    showDate: dateKey !== previousDateKey,
    dateKey,
    tagsText: Array.isArray(moment.tags) ? moment.tags.slice(0, 4).join(' · ') : '',
    locationLabel: moment.location && moment.location.name ? moment.location.name : '位置未记录',
  };
}

export function presentTimeline(moments) {
  let previousDateKey = '';
  return moments.map((moment) => {
    const presented = presentMoment(moment, previousDateKey);
    previousDateKey = presented.dateKey;
    return presented;
  });
}
