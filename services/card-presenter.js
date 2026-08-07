import { formatAmount, formatMoney, formatPeriodLabel, formatRangeLabel } from './format.js';

function itemMeta(moment) {
  return [
    moment && moment.occurredAt ? String(moment.occurredAt).slice(0, 10) : '',
    moment && moment.location && moment.location.name ? moment.location.name : '',
  ].filter(Boolean).join(' · ');
}

export function createMomentResultCard({ operationLabel, statusTitle, summary, moment, continuationHint }) {
  return {
    route: 'pages/cards/moment-result',
    data: {
      operationLabel: operationLabel || 'Moment',
      statusTitle: statusTitle || '',
      summary: summary || '',
      timeLabel: moment && moment.occurredAt ? String(moment.occurredAt).slice(0, 16).replace('T', ' ') : '',
      locationName: moment && moment.location && moment.location.name ? moment.location.name : '',
      tagsText: moment && Array.isArray(moment.tags) ? moment.tags.join(' · ') : '',
      continuationHint: continuationHint || '可继续用语音查询或修改',
    },
  };
}

export function createMemoryAnswerCard({ question, answer, evidence }) {
  const moments = Array.isArray(evidence) ? evidence : [];
  return {
    route: 'pages/cards/memory-answer',
    data: {
      question: String(question || ''),
      answer: String(answer || ''),
      evidenceCount: moments.length,
      items: moments.slice(0, 3).map((moment) => ({
        title: String(moment.title || '未命名 Moment'),
        meta: itemMeta(moment),
      })),
    },
  };
}


export function createAccountUnbindCard({ accountLabel = '当前账号' } = {}) {
  return {
    route: 'pages/cards/account-unbind',
    data: {
      accountLabel: String(accountLabel || '当前账号'),
      status: 'confirm',
      message: '解绑后会清除本机账号凭据，需要重新扫码才能继续使用账号功能。',
      remoteRevoked: false,
    },
  };
}

export function createAccountUnbindResultCard({ accountLabel = '当前账号', message, remoteRevoked = false } = {}) {
  return {
    route: 'pages/cards/account-unbind',
    data: {
      accountLabel: String(accountLabel || '当前账号'),
      status: remoteRevoked ? 'success' : 'error',
      message: String(message || ''),
      remoteRevoked: Boolean(remoteRevoked),
    },
  };
}

// MCP 记账统计卡片数据契约：bookkeeping_summary 的 structuredContent 直接映射
// （数据同源，不做本地二次聚合）。status='error' 时展示错误态。
// 页面 UI 由眼镜端本地 .ink 渲染（index 内嵌卡片）；未来宿主 Tool Rendering
// 支持时可用同一份 data 渲染对话内卡片。
export function createMcpSummaryCard({ summary, message = '' } = {}) {
  const s = summary || {};
  const byCategory = Array.isArray(s.byCategory) ? s.byCategory : [];
  const period = String(s.period || 'month');
  const errorMessage = String(message || '');
  return {
    data: {
      period,
      periodLabel: period === 'custom'
        ? formatRangeLabel(s.from, s.to)
        : formatPeriodLabel(period, s.year, s.month),
      income: Number(s.income || 0),
      expense: Number(s.expense || 0),
      balance: Number(s.balance || 0),
      count: Number(s.count || 0),
      incomeLabel: `+${formatAmount(Number(s.income || 0))}`,
      expenseLabel: `-${formatAmount(Number(s.expense || 0))}`,
      balanceLabel: (Number(s.balance || 0) < 0 ? '-' : '+') + formatAmount(Math.abs(Number(s.balance || 0))),
      topCategories: byCategory.slice(0, 3).map((item) => ({
        category: String((item && item.category) || '未分类'),
        amount: Number((item && item.amount) || 0),
        amountLabel: formatMoney(Number((item && item.amount) || 0)),
      })),
      status: errorMessage ? 'error' : 'ready',
      message: errorMessage,
    },
  };
}
