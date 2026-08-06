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

// 金额显示（不含符号）：1,234.50；非数字回退 0.00
export function formatAmount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0.00';
  const fixed = Math.abs(number).toFixed(2);
  const parts = String(fixed).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${intPart}.${parts[1]}`;
}

// 金额显示（含符号与货币）：-¥1,234.50 / +¥800.00
export function formatMoney(value) {
  const number = Number(value);
  const sign = number < 0 ? '-' : '+';
  return `${sign}¥${formatAmount(Math.abs(number))}`;
}

// 记账统计周期标签：与 Server bookkeeping_summary 的 label 对齐
export function formatPeriodLabel(period, year, month) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const p = String(period || 'month');
  if (p === 'year') {
    const y = Number(year) || currentYear;
    return y === currentYear ? '本年' : `${y}年`;
  }
  if (p === 'quarter') {
    const y = Number(year) || currentYear;
    const q = Number(month) || (Math.floor((currentMonth - 1) / 3) + 1);
    return y === currentYear ? `本季度（第${q}季）` : `${y}年第${q}季`;
  }
  const y = Number(year) || currentYear;
  const m = Number(month) || currentMonth;
  if (y === currentYear && m === currentMonth) return '本月';
  return y === currentYear ? `${m}月` : `${y}年${m}月`;
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
