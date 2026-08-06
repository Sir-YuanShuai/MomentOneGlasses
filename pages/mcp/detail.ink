<script def>
{
  "navigationBarTitleText": "记账详情",
  "description": "全屏可滚动记账详情页：顶部收支总结块，中部支出分类占比（Pie）与近 6 期收支趋势（Line）图表，底部记账明细列表与操作按钮（记一笔 / 重新统计）。数据全部来自 MCP bookkeeping_summary / bookkeeping_list / bookkeeping_create。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "period": { "type": "string", "enum": ["month", "quarter", "year"], "description": "统计周期" },
        "periodLabel": { "type": "string" },
        "income": { "type": "number" },
        "expense": { "type": "number" },
        "balance": { "type": "number" },
        "count": { "type": "number" },
        "pieSeries": { "type": "array", "description": "Pie 图 series 配置（xName=category, yName=amount）" },
        "pieData": { "type": "array", "description": "支出分类占比数据（byCategory 直接映射）" },
        "lineSeries": { "type": "array", "description": "Line 图 series 配置（expense/income 双序列）" },
        "lineData": { "type": "array", "description": "近 6 期收支趋势数据" },
        "items": { "type": "array", "description": "记账明细（bookkeeping_list items）" },
        "status": { "type": "string", "enum": ["loading", "ready", "error", "recording"] },
        "statusDetail": { "type": "string" },
        "lastAction": { "type": "string", "description": "最近一次「记一笔」的结果" }
      },
      "required": ["status"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { createMcpClient, describeMcpError } from '../../services/mcp-client.js';
import { CONTROL, resolveControl } from '../../services/controls.js';
import { formatAmount, formatDateLabel, formatMoney, formatPeriodLabel, formatTime } from '../../services/format.js';

const PIE_SERIES = [{ xName: 'category', yName: 'amount' }];
const LINE_SERIES = [
  { xName: 'label', yName: 'expense' },
  { xName: 'label', yName: 'income' }
];
const TREND_POINTS = 6;

function trendParams(period, offset) {
  const now = new Date();
  if (period === 'month') {
    const total = now.getUTCFullYear() * 12 + now.getUTCMonth();
    const target = total - offset;
    return { period: 'month', year: Math.floor(target / 12), month: (target % 12) + 1 };
  }
  if (period === 'quarter') {
    const total = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3);
    const target = total - offset;
    return { period: 'quarter', year: Math.floor(target / 4), month: (target % 4) + 1 };
  }
  return null;
}

function presentItem(item) {
  const amount = Number(item && item.amount || 0);
  const flow = item && item.flow === 'income' ? 'income' : 'expense';
  const dateLabel = item && item.occurredAt ? formatDateLabel(item.occurredAt) : '';
  const timeLabel = item && item.occurredAt ? formatTime(item.occurredAt) : '';
  const account = item && item.account ? String(item.account) : '';
  const metaParts = [];
  if (dateLabel) metaParts.push(dateLabel);
  if (timeLabel) metaParts.push(timeLabel);
  if (account) metaParts.push(account);
  return {
    id: item && item.id ? item.id : '',
    category: String((item && item.category) || '未分类'),
    account,
    amountLabel: flow === 'income' ? formatMoney(amount) : `-${formatAmount(amount)}`,
    metaLabel: metaParts.join(' ')
  };
}

export default {
  data: {
    period: 'month',
    periodLabel: '本月',
    income: 0,
    expense: 0,
    balance: 0,
    count: 0,
    incomeLabel: '+¥0.00',
    expenseLabel: '-¥0.00',
    balanceLabel: '+¥0.00',
    pieSeries: PIE_SERIES,
    pieData: [],
    lineSeries: LINE_SERIES,
    lineData: [],
    items: [],
    status: 'loading',
    statusDetail: '正在从服务端读取记账数据',
    lastAction: ''
  },

  onLoad(query) {
    this.client = createMcpClient();
    this.busy = false;
    const period = query && query.period ? String(query.period) : 'month';
    this.setData({ period });
    this.loadSummary();
  },

  // 数据契约：summary structuredContent → 页面数据 / chart 数据（数据同源，不做本地二次聚合）
  applySummary(summary) {
    const byCategory = Array.isArray(summary.byCategory) ? summary.byCategory : [];
    const income = Number(summary.income || 0);
    const expense = Number(summary.expense || 0);
    const balance = Number(summary.balance || 0);
    this.setData({
      periodLabel: formatPeriodLabel(this.data.period, summary.year, summary.month),
      income,
      expense,
      balance,
      count: Number(summary.count || 0),
      incomeLabel: `+${formatAmount(income)}`,
      expenseLabel: `-${formatAmount(expense)}`,
      balanceLabel: balance < 0 ? `-${formatAmount(Math.abs(balance))}` : `+${formatAmount(balance)}`,
      pieData: byCategory.map((item) => ({
        category: String((item && item.category) || '未分类'),
        amount: Number((item && item.amount) || 0),
        amountLabel: formatMoney(Number((item && item.amount) || 0))
      }))
    });
  },

  async loadTrend() {
    const points = [];
    const offsets = this.data.period === 'year' ? [] : [TREND_POINTS - 1, TREND_POINTS - 2, TREND_POINTS - 3, TREND_POINTS - 4, TREND_POINTS - 5, 0];
    for (let i = 0; i < offsets.length; i += 1) {
      const params = trendParams(this.data.period, offsets[i]);
      if (!params) continue;
      try {
        const result = await this.client.callTool('bookkeeping_summary', params);
        points.push({
          label: params.period === 'quarter' ? `第${params.month}季` : `${params.month}月`,
          expense: Number(result && result.expense || 0),
          income: Number(result && result.income || 0)
        });
      } catch (error) {
        console.warn('[moment-one:mcp] trend point failed', params, error);
      }
    }
    return points;
  },

  async loadSummary() {
    if (this.busy) return;
    this.busy = true;
    this.setData({ status: 'loading', statusDetail: '正在从服务端读取记账数据' });
    try {
      const summary = await this.client.callTool('bookkeeping_summary', { period: this.data.period });
      this.applySummary(summary);
      const [lineData, listResult] = await Promise.all([
        this.loadTrend(),
        this.client.callTool('bookkeeping_list', { limit: 20 })
      ]);
      const items = listResult && Array.isArray(listResult.items) ? listResult.items : [];
      this.setData({
        lineData,
        items: items.map(presentItem),
        status: 'ready',
        statusDetail: ''
      });
    } catch (error) {
      console.error('[moment-one:mcp] detail load failed:', error);
      this.setData({ status: 'error', statusDetail: describeMcpError(error) });
    } finally {
      this.busy = false;
    }
  },

  createId() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    return `mcp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },

  // 「记一笔」：再次调用 bookkeeping_create（示例参数，带幂等键）
  async addSampleEntry() {
    if (this.busy || this.data.status === 'loading') return;
    this.busy = true;
    this.setData({ status: 'recording', statusDetail: '正在记一笔示例账' });
    try {
      const result = await this.client.callTool('bookkeeping_create', {
        amount: 28.5,
        flow: 'expense',
        account: '微信',
        category: '餐饮',
        occurredAt: new Date().toISOString(),
        idempotencyKey: this.createId()
      });
      this.setData({
        lastAction: `已记录 ${result && result.category ? result.category : '餐饮'} ¥28.50`,
        statusDetail: ''
      });
      await this.loadSummary();
    } catch (error) {
      console.error('[moment-one:mcp] create failed:', error);
      this.setData({ status: 'error', statusDetail: describeMcpError(error) });
      this.busy = false;
    }
  },

  refreshData() {
    if (this.busy) return;
    this.loadSummary();
  },

  leavePage() {
    try {
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.redirectTo({ url: '/pages/index/index' });
    }
  },

  onKeyUp(event) {
    const control = resolveControl(event && event.code);
    if (!control) return;
    if (control === CONTROL.BACK) {
      event.preventDefault();
      this.leavePage();
      return;
    }
    // 方向键/确认键交由宿主默认行为（scroll-view 滚动、导航模式激活焦点按钮）
  }
};
</script>

<page>
  <scroll-view class="detail-scroll" scroll-y="true">
    <view class="summary-block">
      <view class="block-head">
        <text class="eyebrow">记账统计 · {{ periodLabel }}</text>
        <text class="count-label" ink:if="{{ status === 'ready' }}">{{ count }} 笔</text>
      </view>
      <view class="metric-row">
        <view class="metric">
          <text class="metric-label">支出</text>
          <text class="metric-value metric-expense">{{ expenseLabel }}</text>
        </view>
        <view class="metric">
          <text class="metric-label">收入</text>
          <text class="metric-value metric-income">{{ incomeLabel }}</text>
        </view>
        <view class="metric">
          <text class="metric-label">结余</text>
          <text class="metric-value metric-balance">{{ balanceLabel }}</text>
        </view>
      </view>
    </view>

    <view class="chart-block" ink:if="{{ pieData.length }}">
      <text class="section-title">支出分类占比</text>
      <chart type="pie" series="{{ pieSeries }}" data="{{ pieData }}" width="360" height="190"></chart>
      <view class="pie-legend">
        <view class="legend-item" ink:for="{{ pieData }}" ink:key="category">
          <text class="legend-name">{{ item.category }}</text>
          <text class="legend-amount">{{ item.amountLabel }}</text>
        </view>
      </view>
    </view>

    <view class="chart-block" ink:if="{{ lineData.length > 1 }}">
      <text class="section-title">近 {{ lineData.length }} 期收支趋势</text>
      <chart type="line" series="{{ lineSeries }}" data="{{ lineData }}" width="360" height="160"></chart>
    </view>

    <view class="list-block">
      <text class="section-title">记账明细</text>
      <view class="list-item" ink:for="{{ items }}" ink:key="id">
        <view class="item-main">
          <text class="item-category">{{ item.category }}</text>
          <text class="item-meta">{{ item.metaLabel }}</text>
        </view>
        <text class="item-amount">{{ item.amountLabel }}</text>
      </view>
      <text class="empty-hint" ink:if="{{ !items.length && status === 'ready' }}">本周期暂无记账明细</text>
    </view>

    <view class="action-block">
      <button class="button button-primary" bindtap="addSampleEntry">记一笔（示例）</button>
      <button class="button button-secondary" bindtap="refreshData">重新统计</button>
      <text class="action-hint">数据来自 MCP bookkeeping 工具</text>
      <text class="status-line" ink:if="{{ statusDetail }}">{{ statusDetail }}</text>
      <text class="status-line status-ok" ink:if="{{ lastAction && !statusDetail }}">{{ lastAction }}</text>
    </view>
  </scroll-view>
</page>

<style>
.detail-scroll {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  background-color: var(--color-background);
  color: var(--color-text-primary);
}
.summary-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg) var(--spacing-sm);
}
.block-head {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.eyebrow { color: var(--color-primary); font-size: 13px; line-height: 18px; font-weight: 700; }
.count-label { color: var(--color-text-secondary); font-size: 11px; line-height: 15px; }
.metric-row { display: flex; flex-direction: row; gap: var(--spacing-sm); }
.metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--spacing-sm);
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-md);
}
.metric-label { color: var(--color-text-secondary); font-size: 11px; line-height: 15px; }
.metric-value { font-size: 18px; line-height: 24px; font-weight: 700; }
.metric-expense, .metric-income { color: var(--color-primary); }
.metric-balance { color: var(--color-text-primary); }
.chart-block, .list-block, .action-block {
  margin: var(--spacing-sm) var(--spacing-lg);
  padding: var(--spacing-sm) var(--spacing-md);
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-md);
}
.section-title { color: var(--color-primary); font-size: 12px; line-height: 17px; font-weight: 700; }
.pie-legend { display: flex; flex-direction: column; gap: 3px; margin-top: var(--spacing-sm); }
.legend-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 11px;
  line-height: 16px;
}
.legend-name { color: var(--color-text-secondary); }
.legend-amount { color: var(--color-primary); }
.list-block { display: flex; flex-direction: column; gap: 4px; }
.list-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 6px 2px;
  border-bottom: var(--border-width-thin) solid var(--border-color-muted);
}
.item-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.item-category { font-size: 13px; line-height: 18px; }
.item-meta { color: var(--color-text-secondary); font-size: 10px; line-height: 14px; }
.item-amount { color: var(--color-primary); font-size: 13px; line-height: 18px; font-weight: 700; }
.empty-hint { color: var(--color-text-secondary); font-size: 11px; line-height: 15px; }
.action-block { display: flex; flex-direction: column; gap: var(--spacing-sm); }
.button { min-height: 38px; border-radius: var(--radius-md); font-size: 13px; line-height: 38px; }
.button-primary { color: var(--color-background); background-color: var(--color-primary); }
.button-secondary {
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  border: var(--border-width-thin) solid var(--border-color-muted);
}
.action-hint { color: var(--color-text-secondary); font-size: 10px; line-height: 14px; }
.status-line { color: var(--color-text-secondary); font-size: 11px; line-height: 16px; }
.status-ok { color: var(--color-primary); }
</style>
