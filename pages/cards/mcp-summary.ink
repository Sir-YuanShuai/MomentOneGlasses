<script def>
{
  "navigationBarTitleText": "记账统计",
  "description": "在对话流中展示 MCP bookkeeping_summary 的结果卡片：周期收支总结置顶（支出/收入/结余数字 + 分类 Top3），点击「查看详情」进入全屏可滚动页。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "period": { "type": "string", "description": "统计周期：month / quarter / year" },
        "periodLabel": { "type": "string", "description": "周期展示标签，如「本月」" },
        "income": { "type": "number", "description": "周期收入合计（结构化输出 income）" },
        "expense": { "type": "number", "description": "周期支出合计（结构化输出 expense）" },
        "balance": { "type": "number", "description": "结余 = income - expense" },
        "count": { "type": "number", "description": "计入统计的记录条数" },
        "topCategories": {
          "type": "array",
          "description": "支出分类占比 Top3（byCategory 按金额降序取前 3）",
          "items": {
            "type": "object",
            "properties": {
              "category": { "type": "string" },
              "amount": { "type": "number" }
            },
            "required": ["category", "amount"]
          }
        },
        "status": { "type": "string", "enum": ["loading", "ready", "error"], "description": "卡片状态" },
        "message": { "type": "string", "description": "错误提示（status=error 时）" }
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
import { formatAmount, formatMoney, formatPeriodLabel } from '../../services/format.js';

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
    topCategories: [],
    status: 'loading',
    message: ''
  },

  onLoad(query) {
    this.client = createMcpClient();
    this.setData({ status: 'loading', message: '' });
    const rawData = query && query.data ? this.decodeData(query.data) : null;
    if (rawData && typeof rawData === 'object') {
      this.applyCardData(rawData);
    } else {
      this.loadSummary();
    }
  },

  decodeData(raw) {
    try {
      return JSON.parse(decodeURIComponent(String(raw)));
    } catch (error) {
      return null;
    }
  },

  // 数据契约：bookkeeping_summary structuredContent 直接映射（不做本地二次聚合）
  applyCardData(summary) {
    const byCategory = Array.isArray(summary.byCategory) ? summary.byCategory : [];
    const period = String(summary.period || 'month');
    const income = Number(summary.income || 0);
    const expense = Number(summary.expense || 0);
    const balance = Number(summary.balance || 0);
    this.setData({
      period,
      periodLabel: formatPeriodLabel(period, summary.year, summary.month),
      income,
      expense,
      balance,
      count: Number(summary.count || 0),
      incomeLabel: `+${formatAmount(income)}`,
      expenseLabel: `-${formatAmount(expense)}`,
      balanceLabel: balance < 0 ? `-${formatAmount(Math.abs(balance))}` : `+${formatAmount(balance)}`,
      topCategories: byCategory.slice(0, 3).map((item) => ({
        category: String((item && item.category) || '未分类'),
        amount: Number((item && item.amount) || 0),
        amountLabel: formatMoney(Number((item && item.amount) || 0))
      })),
      status: 'ready',
      message: ''
    });
  },

  async loadSummary() {
    this.setData({ status: 'loading', message: '' });
    try {
      const summary = await this.client.callTool('bookkeeping_summary', { period: this.data.period });
      this.applyCardData(summary);
    } catch (error) {
      console.error('[moment-one:mcp] summary card load failed:', error);
      this.setData({ status: 'error', message: this.describeError(error) });
    }
  },

  describeError(error) {
    return describeMcpError(error);
  },

  openDetail() {
    if (this.data.status !== 'ready') return;
    const url = `/pages/mcp/detail?period=${encodeURIComponent(this.data.period)}`;
    try {
      wx.navigateTo({ url });
    } catch (error) {
      wx.redirectTo({ url });
    }
  },

  retry() {
    this.loadSummary();
  },

  leaveCard() {
    try {
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.redirectTo({ url: '/pages/index/index' });
    }
  },

  onKeyUp(event) {
    const control = resolveControl(event && event.code);
    if (!control) return;
    event.preventDefault();
    if (control === CONTROL.BACK) {
      this.leaveCard();
      return;
    }
    if (control === CONTROL.ACTIVATE) {
      if (this.data.status === 'error') this.retry();
      else this.openDetail();
    }
  }
};
</script>

<page>
  <view class="card-shell">
    <view class="card-head">
      <text class="eyebrow">记账统计 · {{ periodLabel }}</text>
      <text class="state-label" ink:if="{{ status === 'ready' }}">{{ count }} 笔</text>
    </view>

    <view class="content" ink:if="{{ status === 'ready' }}">
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

      <view class="category-list" ink:if="{{ topCategories.length }}">
        <view class="category-item" ink:for="{{ topCategories }}" ink:key="category">
          <text class="category-name">{{ item.category }}</text>
          <text class="category-amount">{{ item.amountLabel }}</text>
        </view>
      </view>
      <text class="empty-hint" ink:if="{{ !topCategories.length }}">本周期暂无支出分类</text>

      <button class="button button-primary" bindtap="openDetail">查看详情</button>
      <text class="key-hint">确认键查看详情 · 返回键收起</text>
    </view>

    <view class="content" ink:elif="{{ status === 'error' }}">
      <text class="message">{{ message }}</text>
      <button class="button button-secondary" bindtap="retry">重试</button>
    </view>

    <view class="content" ink:else>
      <text class="message">正在从服务端读取记账统计…</text>
    </view>
  </view>
</page>

<style>
.card-shell {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  padding: var(--spacing-lg);
  background-color: var(--color-background);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
.card-head {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.eyebrow { color: var(--color-primary); font-size: 12px; line-height: 16px; font-weight: 700; }
.state-label { color: var(--color-text-secondary); font-size: 11px; line-height: 15px; }
.content {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  flex: 1;
  min-height: 0;
}
.metric-row {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-sm);
}
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
.metric-value { font-size: 17px; line-height: 22px; font-weight: 700; }
.metric-expense, .metric-income { color: var(--color-primary); }
.metric-balance { color: var(--color-text-primary); }
.category-list { display: flex; flex-direction: column; gap: 4px; }
.category-item {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
}
.category-name { font-size: 12px; line-height: 17px; }
.category-amount { color: var(--color-primary); font-size: 12px; line-height: 17px; }
.empty-hint { color: var(--color-text-secondary); font-size: 11px; line-height: 15px; }
.message { color: var(--color-text-secondary); font-size: 13px; line-height: 19px; }
.button { min-height: 36px; border-radius: var(--radius-md); font-size: 13px; line-height: 36px; }
.button-primary { color: var(--color-background); background-color: var(--color-primary); }
.button-secondary {
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  border: var(--border-width-thin) solid var(--border-color-muted);
}
.key-hint { color: var(--color-primary); font-size: 11px; line-height: 16px; }
</style>
