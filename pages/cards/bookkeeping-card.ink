<script def>
{
  "navigationBarTitleText": "记账",
  "description": "记账/查账相关问题优先返回此工具：记一笔账、查账单统计（本月/上月/某月/某年）、查账单明细。可传入用户原话（utterance）由页面自动解析执行；若宿主已查询到统计数据，也可直接传入 period/income/expense/balance/count 等数据同步渲染卡片。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "utterance": {
          "type": "string",
          "description": "用户的原话指令，例如：上个月花了多少 / 记一笔午餐 28.5 元 / 看看这个月的账单（未传入统计数据时由页面自行解析执行）"
        },
        "period": {
          "type": "string",
          "description": "统计周期：month/quarter/year，或 custom（配合 from/to 自定义范围）"
        },
        "year": { "type": "integer", "description": "周期年份（可选）" },
        "month": { "type": "integer", "description": "周期月份 1-12 或季度 1-4（可选）" },
        "from": { "type": "string", "description": "自定义范围开始 ISO-8601（period=custom 时）" },
        "to": { "type": "string", "description": "自定义范围结束 ISO-8601（period=custom 时）" },
        "income": { "type": "number", "description": "周期收入合计（宿主已查询到数据时传入，同步渲染）" },
        "expense": { "type": "number", "description": "周期支出合计" },
        "balance": { "type": "number", "description": "结余（缺省按 income-expense）" },
        "count": { "type": "number", "description": "计入统计的记录笔数" },
        "byCategory": {
          "type": "array",
          "description": "支出分类小计 [{category, amount}]",
          "items": { "type": "object" }
        }
      }
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

// A2UI 指标卡 commands（宿主对话流卡片容器对页面 data 异步刷新支持有限，
// a2ui 是官方「AI 对话交互容器」，指标区改用 a2ui 动态渲染）
function buildMetricCommands(values) {
  const expense = String(values.expense || '--');
  const income = String(values.income || '--');
  const balance = String(values.balance || '--');
  const metric = (id, label, valueKey) => ({
    id,
    type: 'view',
    props: {
      style: 'flex: 1; display: flex; flex-direction: column; align-items: center; padding: 8px; border: 1px solid rgba(0, 255, 127, 0.35); border-radius: 8px;'
    },
    children: [`${id}-label`, `${id}-value`]
  });
  const metricLabel = (id, text) => ({
    id: `${id}-label`,
    type: 'text',
    props: { content: text, style: 'font-size: 10px; color: rgba(0, 255, 127, 0.6);' }
  });
  const metricValue = (id, valueKey) => ({
    id: `${id}-value`,
    type: 'text',
    props: { content: `{{ ${valueKey} }}`, style: 'font-size: 14px; font-weight: bold; color: #00FF7F;' }
  });
  return JSON.stringify([
    { type: 'createSurface', surfaceId: 'bk', containerId: 'root' },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: 'bk',
        path: '/',
        value: { expense, income, balance }
      }
    },
    {
      type: 'updateComponents',
      surfaceId: 'bk',
      components: [
        {
          id: 'root',
          type: 'view',
          props: { style: 'display: flex; flex-direction: row; gap: 8px; width: 100%;' },
          children: ['m-expense', 'm-income', 'm-balance']
        },
        { ...metric('m-expense', '支出', 'expense'), children: ['m-expense-label', 'm-expense-value'] },
        { ...metric('m-income', '收入', 'income'), children: ['m-income-label', 'm-income-value'] },
        { ...metric('m-balance', '结余', 'balance'), children: ['m-balance-label', 'm-balance-value'] },
        metricLabel('m-expense', '支出'),
        metricValue('m-expense', 'expense'),
        metricLabel('m-income', '收入'),
        metricValue('m-income', 'income'),
        metricLabel('m-balance', '结余'),
        metricValue('m-balance', 'balance')
      ]
    }
  ]);
}

function renderA2ui(instance, values) {
  const ctx = a2ui.createA2UIContext('bk-ui');
  const commands = buildMetricCommands(values);
  if (ctx) {
    try {
      ctx.write(commands);
    } catch (error) {
      console.warn('[moment-one:a2ui] write failed, fallback to commands attribute', error);
      instance.setData({ a2uiCommands: commands });
    }
  } else {
    instance.setData({ a2uiCommands: commands });
  }
}

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
    count: 0,
    expenseLabel: '--',
    incomeLabel: '--',
    balanceLabel: '--',
    topCategories: [],
    summaryLine: '',
    catsLine: '',
    resultTitle: '',
    resultMessage: '',
    errorText: '',
    a2uiCommands: buildMetricCommands({ expense: '--', income: '--', balance: '--' })

  // 宿主传入的 0 值参数（模型按 schema 填默认 0）不算真实数据
  looksLikeData(q) {
    const income = Number(q.income || 0);
    const expense = Number(q.expense || 0);
    const count = Number(q.count || 0);
    return income !== 0 || expense !== 0 || count > 0;
  },

  onLoad(query) {
    const q = query || {};

    // 1) 数据传入模式：宿主已查询到真实数据（非零）→ 同步渲染
    if (this.looksLikeData(q)) {
      this.renderFromData(q);
      return;
    }

    // 2) utterance 模式：页面自行解析执行（异步 setData 已证实生效）
    const utterance = q.utterance ? String(q.utterance).trim() : '';
    if (utterance) {
      this.run(utterance);
      return;
    }

    // 3) 宿主只传了空/0 参数：默认查询本月（记账语境，异步取数）
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
    const cats = Array.isArray(card.data.topCategories) ? card.data.topCategories : [];
    this.setData({
      status: 'ready',
      period: card.data.period,
      periodLabel: card.data.periodLabel,
      count: card.data.count,
      expenseLabel: card.data.expenseLabel,
      incomeLabel: card.data.incomeLabel,
      balanceLabel: card.data.balanceLabel,
      topCategories: cats,
      summaryLine: `支出 ${card.data.expenseLabel} · 收入 ${card.data.incomeLabel} · 结余 ${card.data.balanceLabel} · ${card.data.count} 笔`,
      catsLine: cats.map((item) => `${item.category} ${item.amountLabel}`).join(' · ')
    });
    renderA2ui(this, { expense: card.data.expenseLabel, income: card.data.incomeLabel, balance: card.data.balanceLabel });
  },

  // utterance 兜底：复用预路由（远程 bookkeeping_plan → 执行远程工具 → 结果意图）
  // 宿主卡片环境网络有间歇抖动，失败重试一次
  async run(utterance, attempt) {
    const round = Number(attempt) || 1;
    try {
      const plan = await runAgentTurn({ utterance });
      this.renderIntent(plan.intent);
    } catch (error) {
      console.error('[moment-one:card] bookkeeping failed:', error);
      if (round < 2) {
        setTimeout(() => this.run(utterance, round + 1), 800);
        return;
      }
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
    this.setData({ status: 'ready', resultTitle: '操作完成', resultMessage: '服务端已处理该请求。' });
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

    <view class="card-head">
      <text class="eyebrow">记账统计 · {{ periodLabel }}</text>
      <text class="count">{{ count }} 笔</text>
    </view>

    <text class="status-line" ink:if="{{ status === 'loading' }}">正在从记账服务获取数据…</text>
    <text class="error-line" ink:if="{{ status === 'error' }}">{{ errorText }}</text>

    <text class="summary-line" ink:if="{{ summaryLine }}">{{ summaryLine }}</text>
    <text class="cats-line" ink:if="{{ catsLine }}">{{ catsLine }}</text>

    <a2ui
      id="bk-ui"
      commands="{{ a2uiCommands }}"
      style="display: flex; flex-direction: column; width: 100%;"
    ></a2ui>

    <view class="cats" ink:if="{{ topCategories.length }}">
      <view class="cat" ink:for="{{ topCategories }}" ink:key="category">
        <text class="cat-name">{{ item.category }}</text>
        <text class="cat-amount">{{ item.amountLabel }}</text>
      </view>
    </view>

    <view ink:if="{{ resultTitle }}">
      <text class="result-title">{{ resultTitle }}</text>
      <text class="message">{{ resultMessage }}</text>
    </view>

    <button class="action" bindtap="openDetail">查看详情</button>
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
