<script def>
{
  "navigationBarTitleText": "记账",
  "description": "记账/查账相关问题优先返回此工具：记一笔账、查账单统计（本月/上月/某月/某年）、查账单明细。输入用户原话（utterance），页面自动通过远程记账服务解析并执行，结果以卡片形式展示在当前对话流中。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "utterance": {
          "type": "string",
          "description": "用户的原话指令，例如：上个月花了多少 / 记一笔午餐 28.5 元 / 看看这个月的账单"
        }
      },
      "required": ["utterance"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { runAgentTurn } from '../../services/agent-loop.js';
import { APP_VERSION, BUILD_ID } from '../../services/build-info.js';
import { createMcpSummaryCard } from '../../services/card-presenter.js';
import { formatDateLabel, formatTime } from '../../services/format.js';

export default {
  data: {
    status: 'loading', // loading | ready | error
    hostTarget: '_current',
    softwareVersion: APP_VERSION,
    buildId: String(BUILD_ID).slice(0, 8),
    summaryLine: '',
    catsLine: '',
    summary: null,
    resultTitle: '',
    resultMessage: '',
    replyText: '',
    errorText: ''
  },

  onLoad(query) {
    this.setData({ status: 'loading' });
    const utterance = query && query.utterance ? String(query.utterance).trim() : '';
    if (!utterance) {
      this.setData({
        status: 'ready',
        resultTitle: '记账助手',
        resultMessage: '请告诉我记什么账或查什么账，例如「上个月花了多少」「记一笔午餐 28.5 元」。'
      });
      return;
    }
    this.run(utterance);
  },

  // 复用预路由：远程 bookkeeping_plan → 执行远程工具 → 结果意图
  async run(utterance) {
    try {
      const plan = await runAgentTurn({ utterance });
      this.renderIntent(plan.intent);
    } catch (error) {
      console.error('[moment-one:card] bookkeeping failed:', error);
      this.setData({
        status: 'error',
        errorText: (error && error.message) || '记账服务暂时不可用'
      });
    }
  },

  renderIntent(intent) {
    if (!intent) {
      this.setData({ status: 'error', errorText: '记账服务暂时不可用' });
      return;
    }
    if (intent.type === 'mcp.plan.reply') {
      this.setData({
        status: 'ready',
        resultTitle: '记账助手',
        resultMessage: String(intent.reply || '请再说一遍。')
      });
      return;
    }
    if (intent.type !== 'mcp.tool.result') {
      this.setData({ status: 'error', errorText: '暂时无法处理，请稍后再试。' });
      return;
    }

    const toolName = String(intent.toolName || '');
    if (!intent.ok) {
      this.setData({
        status: 'error',
        errorText: intent.errorCode === 'SCOPE_DENIED'
          ? '当前账号缺少记账权限，请在 Web 端授权与设备管理中开启'
          : (intent.errorMessage || '记账服务暂时不可用')
      });
      return;
    }

    if (toolName === 'bookkeeping_summary') {
      const card = createMcpSummaryCard({ summary: intent.result });
      const cats = Array.isArray(card.data.topCategories) ? card.data.topCategories : [];
      this.setData({
        status: 'ready',
        summary: card.data,
        summaryLine: `支出 ${card.data.expenseLabel} · 收入 ${card.data.incomeLabel} · 结余 ${card.data.balanceLabel} · ${card.data.count} 笔`,
        catsLine: cats.map((item) => `${item.category} ${item.amountLabel}`).join(' · ')
      });
      return;
    }
    if (toolName === 'bookkeeping_create') {
      const result = intent.result || {};
      const amount = Number(result.amount || 0);
      const flow = result.flow === 'income' ? '收入' : '支出';
      const category = String(result.category || '未分类');
      const occurredAt = result.occurredAt ? this.formatLocalTime(result.occurredAt) : '';
      const title = result.title ? String(result.title) : `${flow} ${category}`;
      this.setData({
        status: 'ready',
        resultTitle: '记账成功',
        resultMessage: `${title} ¥${amount.toFixed(2)}${occurredAt ? ` · ${occurredAt}` : ''}，已记入服务端账本。`
      });
      return;
    }
    if (toolName === 'bookkeeping_list') {
      const result = intent.result || {};
      const items = Array.isArray(result.items) ? result.items : [];
      const total = Number(result.total || items.length);
      this.setData({
        status: 'ready',
        resultTitle: total > 0 ? `找到 ${total} 笔账单` : '没有找到账单',
        resultMessage: total > 0 ? '可问「这个月花了多少」查看统计。' : '这个时间范围内没有记账记录。'
      });
      return;
    }
    this.setData({ status: 'ready', resultTitle: '操作完成', resultMessage: '服务端已处理该请求。' });
  },

  // Server 返回 ISO-8601（UTC），显示时转本地时区（如北京时间）
  formatLocalTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return `${formatDateLabel(isoString)} ${formatTime(isoString)}`;
  },

  openDetail() {
    if (!this.data.summary) return;
    const url = `/pages/mcp/detail?period=${encodeURIComponent(this.data.summary.period || 'month')}`;
    try {
      wx.navigateTo({ url });
    } catch (error) {
      wx.redirectTo({ url });
    }
  },

  onTargetChanged(target) {
    this.setData({ hostTarget: String(target || '_current') });
  }
};
</script>

<page>
  <view class="card-shell">
    <text class="card-version">一刻 v{{ softwareVersion }} · build {{ buildId }}</text>
    <view class="card-head" ink:if="{{ status === 'ready' && summary }}">
      <text class="eyebrow">记账统计 · {{ summary.periodLabel }}</text>
      <text class="count">{{ summary.count }} 笔</text>
    </view>

    <block ink:if="{{ status === 'loading' }}">
      <text class="message">正在查询记账…</text>
    </block>

    <block ink:elif="{{ status === 'error' }}">
      <text class="message">{{ errorText }}</text>
    </block>

    <block ink:else>
      <text class="summary-line" ink:if="{{ summaryLine }}">{{ summaryLine }}</text>
    <text class="cats-line" ink:if="{{ catsLine }}">{{ catsLine }}</text>

    <view class="metrics" ink:if="{{ summary }}">
        <view class="metric">
          <text class="metric-label">支出</text>
          <text class="metric-value">{{ summary.expenseLabel }}</text>
        </view>
        <view class="metric">
          <text class="metric-label">收入</text>
          <text class="metric-value">{{ summary.incomeLabel }}</text>
        </view>
        <view class="metric">
          <text class="metric-label">结余</text>
          <text class="metric-value">{{ summary.balanceLabel }}</text>
        </view>
      </view>

      <view class="cats" ink:if="{{ summary && summary.topCategories.length }}">
        <view class="cat" ink:for="{{ summary.topCategories }}" ink:key="category">
          <text class="cat-name">{{ item.category }}</text>
          <text class="cat-amount">{{ item.amountLabel }}</text>
        </view>
      </view>

      <view ink:if="{{ resultTitle }}">
        <text class="result-title">{{ resultTitle }}</text>
        <text class="message">{{ resultMessage }}</text>
      </view>

      <button class="action" bindtap="openDetail" ink:if="{{ summary }}">查看详情</button>
    </block>
  </view>
</page>

<style>
.card-shell {
  box-sizing: border-box;
  padding: var(--spacing-md);
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

.eyebrow {
  color: var(--color-primary);
  font-size: 12px;
  line-height: 16px;
  font-weight: 700;
}

.count {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.message {
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 19px;
}

.result-title {
  color: var(--color-primary);
  font-size: 14px;
  line-height: 20px;
  font-weight: 700;
}

.metrics {
  display: flex;
  flex-direction: row;
  gap: var(--spacing-sm);
}

.metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--spacing-sm);
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-md);
}

.metric-label {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.metric-value {
  font-size: 14px;
  line-height: 19px;
  font-weight: 700;
  color: var(--color-primary);
}

.cats {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cat {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 11px;
  line-height: 16px;
}

.cat-name {
  color: var(--color-text-secondary);
}

.cat-amount {
  color: var(--color-primary);
}

.summary-line {
  color: var(--color-text-primary);
  font-size: 13px;
  line-height: 19px;
}

.cats-line {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.card-version {
  color: var(--color-text-secondary);
  font-size: 9px;
  line-height: 13px;
  text-align: center;
}

.action {
  min-height: 34px;
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 34px;
  color: var(--color-background);
  background-color: var(--color-primary);
}

/* 对话流卡片容器（target=_current）：紧凑卡片，不超出对话流 */
@media (target: _current) {
  .card-shell {
    max-height: 320rpx;
    overflow: hidden;
  }
  .cats {
    display: none;
  }
}
</style>
