<script def>
{
  "navigationBarTitleText": "一刻",
  "description": "一刻的远程 MCP 能力入口。用户要记录、查询生活记录、记账查账、查看习惯或执行其他一刻功能时，转发完整原话 utterance；页面动态发现并执行远程工具，优先渲染标准 A2UI。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "utterance": {
          "type": "string",
          "description": "用户的完整原话，例如：上个月花了多少 / 记一笔午餐 28.5 元 / 看看这个月的账单"
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
import { adaptToolResultA2ui, extractToolText } from '../../services/a2ui-adapter.js';
import { APP_VERSION, BUILD_ID } from '../../services/build-info.js';
import { createMcpSummaryCard } from '../../services/card-presenter.js';
import { formatDateLabel, formatTime } from '../../services/format.js';

export default {
  data: {
    status: 'loading', // loading | ready | error
    hostTarget: '_current',
    softwareVersion: APP_VERSION,
    buildId: String(BUILD_ID).slice(0, 8),
    // 全部为顶层字段：宿主对话流卡片容器对嵌套路径（{{ summary.x }}）
    // 的绑定可能不支持（实测显示 undefined），顶层字段渲染正常
    // schema 同名字段（宿主调用工具时把参数注入页面 data，同名覆盖）
    period: 'month',
    income: 0,
    expense: 0,
    balance: 0,
    count: 0,
    byCategory: [],
    utterance: '',
    periodLabel: '—',
    expenseLabel: '--',
    incomeLabel: '--',
    balanceLabel: '--',
    topCategories: [],
    resultTitle: '',
    resultMessage: '',
    errorText: '',
    hasA2ui: false,
    a2uiCommands: '',
    a2uiSurfaceUri: '',
    a2uiFallbackText: ''
  },

  // 宿主传入的 0 值参数（模型按 schema 填默认 0）不算真实数据
  looksLikeData(q) {
    const income = Number(q.income || 0);
    const expense = Number(q.expense || 0);
    const count = Number(q.count || 0);
    return income !== 0 || expense !== 0 || count > 0;
  },

  onLoad(query) {
    const q = query || {};
    // 1) utterance 优先：宿主传了用户原话 → 页面自行解析执行（真实数据）
    const utterance = q.utterance ? String(q.utterance).trim() : '';
    if (utterance) {
      this.run(utterance);
      return;
    }

    // 2) 宿主传入数据（非零）→ 同步渲染（宿主已查询到真实数据时）
    if (this.looksLikeData(q)) {
      this.renderFromData(q);
      return;
    }

    // 3) 无话术且无数据：默认查询本月（记账语境，异步取数）
    this.run('这个月花了多少');
  },

  // 数据传入 → 同步渲染（与 bookkeeping_summary structuredContent 同构）
  renderFromData(q) {
    const income = Number(q.income || 0);
    const expense = Number(q.expense || 0);
    const summaryInput = {
      period: q.period || 'month',
      income,
      expense,
      balance: q.balance !== undefined && q.balance !== null ? Number(q.balance) : income - expense,
      count: Number(q.count || 0),
      byCategory: Array.isArray(q.byCategory) ? q.byCategory : []
    };
    if (q.year !== undefined && q.year !== null) summaryInput.year = Number(q.year);
    if (q.month !== undefined && q.month !== null) summaryInput.month = Number(q.month);
    if (q.from) summaryInput.from = q.from;
    if (q.to) summaryInput.to = q.to;

    const card = createMcpSummaryCard({ summary: summaryInput });
    console.log('[moment-one:card] renderFromData', JSON.stringify(card.data));
    const cats = Array.isArray(card.data.topCategories) ? card.data.topCategories : [];
    this.setData({
      status: 'ready',
      period: card.data.period,
      periodLabel: card.data.periodLabel,
      count: card.data.count,
      expenseLabel: card.data.expenseLabel,
      incomeLabel: card.data.incomeLabel,
      balanceLabel: card.data.balanceLabel,
      topCategories: cats
    });
  },

  // utterance 兜底：复用预路由（远程 bookkeeping_plan → 执行远程工具 → 结果意图）
  // 宿主卡片环境网络有间歇抖动，失败重试一次
  async run(utterance, attempt) {
    const round = Number(attempt) || 1;
    if (round === 1 && this.data.hasA2ui) {
      this.setData({ hasA2ui: false, a2uiCommands: '', a2uiSurfaceUri: '', a2uiFallbackText: '' });
    }
    console.log('[moment-one:card] run start', JSON.stringify({ utterance, round }));
    try {
      const plan = await runAgentTurn({ utterance });
      console.log('[moment-one:card] run plan', JSON.stringify(plan && plan.intent ? plan.intent : plan));
      this.renderIntent(plan.intent);
    } catch (error) {
      console.error('[moment-one:card] bookkeeping failed:', error);
      if (round < 2) {
        setTimeout(() => this.run(utterance, round + 1), 800);
        return;
      }
      this.setData({
        status: 'error',
        errorText: (error && error.message) || '记账服务暂时不可用',
      });
    }
  },

  renderA2uiToolResult(toolResult) {
    let presentation = null;
    try {
      presentation = adaptToolResultA2ui(toolResult);
    } catch (error) {
      console.error('[moment-one:a2ui] payload rejected:', error);
      return false;
    }
    if (!presentation) return false;

    const alreadyMounted = Boolean(this.data.hasA2ui);
    const nextData = {
      status: 'ready',
      hasA2ui: true,
      a2uiSurfaceUri: presentation.uri,
      a2uiFallbackText: presentation.fallbackText || '',
      errorText: ''
    };

    if (!alreadyMounted) {
      // commands is consumed when the conditional component first mounts.
      nextData.a2uiCommands = presentation.commands;
      this.setData(nextData);
      return true;
    }

    this.setData(nextData);
    try {
      const context = a2ui.createA2UIContext('mcp-a2ui');
      if (!context) throw new Error('A2UI context unavailable');
      context.write(presentation.commands);
    } catch (error) {
      console.error('[moment-one:a2ui] runtime update failed:', error);
      this.setData({
        hasA2ui: false,
        a2uiCommands: '',
        errorText: presentation.fallbackText || '动态界面暂不可用，已切换到文本结果'
      });
      return false;
    }
    return true;
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
          : (intent.errorMessage || '记账服务暂时不可用'),
      });
      return;
    }

    // A2UI EmbeddedResource is the primary presentation. The bookkeeping
    // branches below remain as compatibility fallbacks for older Servers.
    if (this.renderA2uiToolResult(intent.toolResult)) return;

    if (toolName === 'bookkeeping_summary') {
      console.log('[moment-one:card] summary result', JSON.stringify(intent.result));
      this.renderFromData(intent.result);
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
    const fallbackText = extractToolText(intent.toolResult);
    if (fallbackText) {
      this.setData({
        status: 'ready',
        resultTitle: toolName || '执行结果',
        resultMessage: fallbackText
      });
      return;
    }
    this.setData({ status: 'error', errorText: '服务没有返回可展示的结果。' });
  },

  // Server 返回 ISO-8601（UTC），显示时转本地时区（如北京时间）
  formatLocalTime(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    return `${formatDateLabel(isoString)} ${formatTime(isoString)}`;
  },

  openDetail() {
    if (!this.data.period) return;
    const url = `/pages/mcp/detail?period=${encodeURIComponent(this.data.period || 'month')}`;
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

    <view class="card-head" ink:if="{{ !hasA2ui }}">
      <text class="eyebrow">记账统计 · {{ periodLabel }}</text>
      <text class="count">{{ count }} 笔</text>
    </view>

    <text class="status-line" ink:if="{{ status === 'loading' }}">正在从一刻服务获取数据…</text>
    <text class="error-line" ink:if="{{ status === 'error' }}">{{ errorText }}</text>

    <a2ui
      ink:if="{{ hasA2ui }}"
      id="mcp-a2ui"
      commands="{{ a2uiCommands }}"
      class="a2ui-surface"
    ></a2ui>
    <text class="a2ui-fallback" ink:if="{{ hasA2ui && a2uiFallbackText }}">{{ a2uiFallbackText }}</text>

    <view class="metrics" ink:if="{{ !hasA2ui }}">
      <view class="metric">
        <text class="metric-label">支出</text>
        <text class="metric-value">{{ expenseLabel }}</text>
      </view>
      <view class="metric">
        <text class="metric-label">收入</text>
        <text class="metric-value">{{ incomeLabel }}</text>
      </view>
      <view class="metric">
        <text class="metric-label">结余</text>
        <text class="metric-value">{{ balanceLabel }}</text>
      </view>
    </view>

    <view class="cats" ink:if="{{ !hasA2ui && topCategories.length }}">
      <view class="cat" ink:for="{{ topCategories }}" ink:key="category">
        <text class="cat-name">{{ item.category }}</text>
        <text class="cat-amount">{{ item.amountLabel }}</text>
      </view>
    </view>

    <view ink:if="{{ !hasA2ui && resultTitle }}">
      <text class="result-title">{{ resultTitle }}</text>
      <text class="message">{{ resultMessage }}</text>
    </view>

    <button class="action" ink:if="{{ !hasA2ui }}" bindtap="openDetail">查看详情</button>
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

.hint {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.card-version {
  color: var(--color-text-secondary);
  font-size: 9px;
  line-height: 13px;
  text-align: center;
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

.a2ui-surface {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.a2ui-fallback {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
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

.status-line {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 17px;
}

.error-line {
  color: var(--color-primary);
  font-size: 12px;
  line-height: 17px;
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
