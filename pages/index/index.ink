<script def>
{
  "navigationBarTitleText": "一刻",
  "description": "一刻记账助手应用入口（沉浸式页面）：用户直接打开应用时进入本页；页内语音入口 → 远程记账服务（bookkeeping_plan → create/summary/list）→ 结果卡片内嵌在对话区。记账/查账的对话流卡片请使用 bookkeeping-card 页面工具。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "initialUtterance": {
          "type": "string",
          "description": "首句自然语言记账/查账指令（如：上个月花了多少 / 记一笔午餐 28.5 元），由页面直接走记账预路由"
        },
        "localDebug": {
          "type": "string",
          "description": "仅本地 Ink Web 调试使用的能力桥接开关"
        },
        "bindingGate": {
          "type": "boolean",
          "description": "首次进入 index 时显示的账号绑定入口"
        },
        "softwareVersion": {
          "type": "string",
          "description": "当前应用语义版本"
        },
        "buildId": {
          "type": "string",
          "description": "当前 AIX 构建短码"
        }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { SpeechRecognition } from 'speech';
import { runAgentTurn } from '../../services/agent-loop.js';
import { createMcpClient, describeMcpError } from '../../services/mcp-client.js';
import { getValidAccessToken } from '../../services/binding.js';
import { CONTROL, resolveControl } from '../../services/controls.js';
import { APP_VERSION, BUILD_ID } from '../../services/build-info.js';
import { createMcpSummaryCard } from '../../services/card-presenter.js';

export default {
  data: {
    phase: 'idle',
    statusTitle: '请直接说出要记的账或要查的账',
    statusDetail: '例如「记一笔午餐 28.5 元」「上个月花了多少」',
    transcript: '',
    localDebug: false,
    answer: '',
    answerLabel: '记账助手',
    evidenceCount: 0,
    sttLabel: '待命',
    bindingGate: true,
    scrollIntoView: '',
    // 内嵌对话流卡片（对话式 AIUI：结果卡片直接出现在对话区，不跳转）
    mcpCard: {
      visible: false,
      period: 'month',
      periodLabel: '',
      incomeLabel: '',
      expenseLabel: '',
      balanceLabel: '',
      count: 0,
      topCategories: []
    },
    softwareVersion: APP_VERSION,
    buildId: String(BUILD_ID).slice(0, 8)
  },

  onLoad(input) {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.pageVisible = true;
    this.listeningRequested = false;
    this.recognitionActive = false;
    this.recognitionToken = 0;
    this.interactionSessionId = 0;
    this.processing = false;
    const isLocalMode = input && (input.localMode === true || input.localMode === 'true');
    this.localMode = Boolean(isLocalMode);
    this.suppressAutomaticEntry = Boolean(input && (input.fromBinding === true || input.fromBinding === 'true'));
    this.bindingReady = this.localMode;
    this.bindingCheckPending = !this.localMode;
    this.setData({
      bindingGate: !this.localMode,
      phase: this.localMode ? 'idle' : 'binding',
      statusTitle: this.localMode ? '请直接说出要记的账或要查的账' : '尚未绑定账号',
      statusDetail: this.localMode ? '例如「记一笔午餐 28.5 元」「上个月花了多少」' : '按确认键扫码绑定账号，完成后自动进入',
      localDebug: Boolean(input && (input.localDebug === true || input.localDebug === 'true')),
      softwareVersion: APP_VERSION,
      buildId: String(BUILD_ID).slice(0, 8)
    });
    if (!this.localMode) this.ensureBinding();
    this.pendingInitialUtterance = input && input.initialUtterance ? input.initialUtterance : '';
  },

  onShow() {
    this.pageVisible = true;
    if (!this.localMode && !this.bindingReady) return;
    // 兜底：从 MCP 卡片/详情页返回时，确保不卡在「处理中」（防止异常路径
    // 残留 searching/classifying 状态导致无法进行下一次问答）
    if (this.data.phase === 'searching' || this.data.phase === 'classifying') {
      this.processing = false;
      this.setData({
        phase: 'idle',
        statusTitle: '请直接说出要记的账或要查的账',
        statusDetail: '例如「记一笔午餐 28.5 元」「上个月花了多少」'
      });
    }
    if (this.pendingInitialUtterance) {
      const utterance = this.pendingInitialUtterance;
      this.pendingInitialUtterance = '';
      this.routeRecognizedText(utterance);
      return;
    }
    if (this.suppressAutomaticEntry) {
      this.setData({
        phase: 'idle',
        statusTitle: '账号绑定成功',
        statusDetail: '例如「记一笔午餐 28.5 元」「上个月花了多少」'
      });
      return;
    }
    if (this.data.phase === 'listening' && this.listeningRequested && !this.recognitionActive) {
      this.startRecognition();
      return;
    }
    if (!this.isBusy()) this.beginIntentListening();
  },

  onHide() {
    this.pageVisible = false;
    this.suspendRecognition();
  },

  onUnload() {
    this.pageVisible = false;
    this.listeningRequested = false;
    this.disposeRecognition();
  },

  async ensureBinding() {
    const token = await getValidAccessToken();
    this.bindingCheckPending = false;
    if (!token) {
      this.bindingReady = false;
      this.setData({
        bindingGate: true,
        phase: 'binding',
        statusTitle: '尚未绑定账号',
        statusDetail: '按确认键扫码绑定账号，完成后自动进入'
      });
      return null;
    }
    this.bindingReady = true;
    this.setData({
      bindingGate: false,
      phase: 'idle',
      statusTitle: '请直接说出要记的账或要查的账',
      statusDetail: '例如「记一笔午餐 28.5 元」「上个月花了多少」'
    });
    this.onShow();
    return token;
  },

  openScanPage() {
    if (this.bindingCheckPending) return;
    wx.redirectTo({ url: '/pages/scan/scan' });
  },

  isBusy() {
    return this.data.phase === 'listening'
      || this.data.phase === 'classifying'
      || this.data.phase === 'searching';
  },

  beginIntentListening(title = '请直接说出要记的账或要查的账', options = {}) {
    if (this.isBusy()) return;
    this.interactionSessionId += 1;
    this.stopRequested = false;
    this.listeningRequested = true;
    this.recognitionFailed = false;
    this.recognizedText = '';
    this.setData({
      phase: 'listening',
      statusTitle: title,
      statusDetail: options.detail || '例如「记一笔午餐 28.5 元」「上个月花了多少」',
      transcript: '',
      answer: '',
      answerLabel: '记账助手',
      evidenceCount: 0,
      sttLabel: '连接中'
    });
    this.startRecognition();
  },

  startRecognition() {
    if (this.recognitionActive || !this.listeningRequested || this.data.phase !== 'listening' || !this.pageVisible) {
      return;
    }

    const token = this.recognitionToken + 1;
    this.recognitionToken = token;
    this.recognitionFailed = false;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (token !== this.recognitionToken) return;
        this.recognitionActive = true;
        this.setData({ sttLabel: '监听中' });
      };

      recognition.onresult = (event) => {
        if (token !== this.recognitionToken) return;
        const transcript = this.extractTranscript(event);
        if (!transcript) return;
        this.recognizedText = transcript;
        this.setData({ transcript, sttLabel: '已听到' });
      };

      recognition.onerror = (event) => {
        if (token !== this.recognitionToken) return;
        this.recognitionFailed = true;
        console.warn('Speech recognition error:', event && (event.error || event.message));
        this.setData({
          sttLabel: '暂不可用',
          statusDetail: '语音暂不可用，可由宿主重新传入自然语言指令'
        });
      };

      recognition.onend = () => {
        if (token !== this.recognitionToken) return;
        this.recognitionActive = false;
        this.recognition = null;
        if (!this.listeningRequested || this.data.phase !== 'listening') return;

        if (this.recognizedText) {
          const text = this.recognizedText;
          this.listeningRequested = false;
          this.routeRecognizedText(text);
          return;
        }

        if (this.stopRequested) {
          this.listeningRequested = false;
          this.finishWithoutSpeech();
          return;
        }

        if (this.pageVisible && !this.recognitionFailed) {
          this.setData({ sttLabel: '继续监听' });
          this.startRecognition();
        }
      };

      this.recognition = recognition;
      this.recognitionActive = true;
      recognition.start();
    } catch (error) {
      if (token !== this.recognitionToken) return;
      console.warn('Speech recognition unavailable:', error);
      this.recognition = null;
      this.recognitionActive = false;
      this.recognitionFailed = true;
      this.setData({
        sttLabel: '暂不可用',
        statusDetail: '语音暂不可用，可由宿主重新传入自然语言指令'
      });
    }
  },

  extractTranscript(event) {
    try {
      const results = event && event.results;
      if (!results || !results.length) return '';
      const resultIndex = Number(event.resultIndex || 0);
      const result = results[resultIndex] || results[results.length - 1];
      const alternative = result && result[0];
      return String((alternative && alternative.transcript) || result.transcript || '').trim();
    } catch (error) {
      return '';
    }
  },

  async routeRecognizedText(text) {
    const normalized = String(text || '').trim();
    if (!normalized) {
      this.finishWithoutSpeech();
      return;
    }
    if (this.processing) return;

    this.processing = true;
    this.listeningRequested = false;
    this.disposeRecognition();
    this.setData({
      phase: 'classifying',
      statusTitle: '正在处理记账请求',
      statusDetail: '通过远程记账服务识别并执行',
      transcript: normalized,
      answer: '',
      answerLabel: '记账助手',
      evidenceCount: 0,
      sttLabel: '已结束'
    });

    try {
      const plan = await runAgentTurn({ utterance: normalized });
      this.processing = false;
      this.dispatchIntent(plan.intent, normalized);
    } catch (error) {
      console.error('Unable to process bookkeeping request:', error);
      this.processing = false;
      this.setResult('暂时无法处理', '请稍后再试一次。', '记账助手');
    }
  },

  dispatchIntent(intent, originalText) {
    switch (intent.type) {
      case 'mcp.tool.result':
        this.presentMcpToolResult(intent);
        return;
      case 'mcp.plan.reply':
        this.setResult('记账助手', String(intent.reply || '请再说一遍。'), '记账助手');
        this.speak(intent.reply);
        return;
      default:
        this.setResult(
          '还不能确定你的意图',
          '可以说「记一笔午餐 28.5 元」或「上个月花了多少」。',
          '记账助手'
        );
    }
  },

  // 记账统计 → 内嵌对话流卡片（对话式 AIUI：卡片出现在对话区，不跳转；
  // 「查看详情」才进全屏页）。summary 已取到时直接复用，避免二次调用。
  async presentMcpSummary(period, summary, args) {
    if (this.processing) return;
    this.processing = true;
    this.disposeRecognition();
    this.setData({
      phase: 'searching',
      statusTitle: '正在查询记账统计',
      statusDetail: '从服务端读取收支汇总',
      transcript: '',
      answer: '',
      answerLabel: '记账统计',
      evidenceCount: 0,
      sttLabel: '已结束'
    });

    try {
      let resolved = summary;
      if (!resolved) {
        const client = createMcpClient();
        const callArgs = { period: String(period || 'month') };
        if (args && Number.isFinite(Number(args.year))) callArgs.year = Number(args.year);
        if (args && Number.isFinite(Number(args.month))) callArgs.month = Number(args.month);
        resolved = await client.callTool('bookkeeping_summary', callArgs);
      }
      this.processing = false;

      const card = createMcpSummaryCard({ summary: resolved });
      const byCategory = Array.isArray(card.data.topCategories) ? card.data.topCategories : [];
      this.setData({
        phase: 'answered',
        statusTitle: '已为你整理记账统计',
        statusDetail: `本月支出 ${card.data.expenseLabel} / 收入 ${card.data.incomeLabel} / 结余 ${card.data.balanceLabel}，共 ${card.data.count} 笔`,
        answer: '',
        answerLabel: '记账统计',
        evidenceCount: card.data.count,
        sttLabel: '待命',
        mcpCard: {
          visible: true,
          period: card.data.period,
          periodLabel: card.data.periodLabel,
          incomeLabel: card.data.incomeLabel,
          expenseLabel: card.data.expenseLabel,
          balanceLabel: card.data.balanceLabel,
          count: card.data.count,
          topCategories: byCategory
        },
        scrollIntoView: 'mcp-card'
      });
      console.info('[moment-one:mcp] bookkeeping summary card embedded in conversation', {
        period: card.data.period,
        count: card.data.count
      });
      return card;
    } catch (error) {
      console.error('[moment-one:mcp] bookkeeping summary failed:', error);
      this.processing = false;
      this.setResult('记账统计不可用', describeMcpError(error), 'MCP 结果');
      return null;
    }
  },

  // 内嵌卡片 → 全屏详情页（对话式 → 沉浸式流转）
  openMcpDetail() {
    if (!this.data.mcpCard.visible) return;
    const url = `/pages/mcp/detail?period=${encodeURIComponent(this.data.mcpCard.period || 'month')}`;
    try {
      wx.navigateTo({ url });
    } catch (error) {
      wx.redirectTo({ url });
    }
  },

  // 收起内嵌卡片（对话继续，不被卡片遮挡）
  dismissMcpCard() {
    this.setData({ 'mcpCard.visible': false, scrollIntoView: '' });
  },

  // 远程 MCP 工具结果 → 对话流展示
  presentMcpToolResult(intent) {
    const toolName = String(intent.toolName || '');
    const args = intent.toolArguments || {};

    if (!intent.ok) {
      const code = intent.errorCode;
      this.setResult(
        '记账操作未完成',
        code === 'SCOPE_DENIED'
          ? '当前账号缺少记账权限，请在 Web 端授权与设备管理中开启'
          : (intent.errorMessage || '记账服务暂时不可用'),
        'MCP 结果'
      );
      return;
    }

    if (toolName === 'bookkeeping_summary') {
      this.presentMcpSummary(args.period || 'month', intent.result, args);
      return;
    }

    if (toolName === 'bookkeeping_create') {
      const result = intent.result || {};
      const amount = Number(result.amount || 0);
      const flow = result.flow === 'income' ? '收入' : '支出';
      const category = String(result.category || '未分类');
      const occurredAt = result.occurredAt ? String(result.occurredAt).slice(0, 16).replace('T', ' ') : '';
      const title = result.title ? String(result.title) : `${flow} ${category}`;
      const message = `${title} ¥${amount.toFixed(2)}${occurredAt ? ` · ${occurredAt}` : ''}，已记入服务端账本。`;
      this.setResult('记账成功', message, 'MCP 记账');
      this.speak(message);
      return;
    }

    if (toolName === 'bookkeeping_list') {
      const result = intent.result || {};
      const items = Array.isArray(result.items) ? result.items : [];
      const total = Number(result.total || items.length);
      this.setResult(
        total > 0 ? `找到 ${total} 笔账单` : '没有找到账单',
        total > 0 ? '可问「这个月花了多少」查看统计，或说「打开记账详情」查看明细。' : '这个时间范围内没有记账记录。',
        'MCP 明细',
        total
      );
      return;
    }

    if (toolName === 'moments_get') {
      const result = intent.result || {};
      this.setResult(
        result.title ? String(result.title) : 'Moment 详情',
        result.occurredAt ? `时间：${String(result.occurredAt).slice(0, 16).replace('T', ' ')}` : '（无时间）',
        'MCP 查询'
      );
      return;
    }

    this.setResult('操作完成', '服务端已处理该请求。', 'MCP 结果');
  },

  setResult(title, message, label = '记账助手', evidenceCount = 0) {
    this.setData({
      phase: 'answered',
      statusTitle: title,
      statusDetail: message,
      answer: message,
      answerLabel: label,
      evidenceCount,
      sttLabel: '待命'
    });
  },

  speak(text) {
    try {
      wx.speech.playTTS(String(text || '').slice(0, 160));
    } catch (error) {
      console.warn('TTS unavailable:', error);
    }
  },

  stopListening() {
    if (this.data.phase !== 'listening') return;
    this.stopRequested = true;
    this.setData({ statusDetail: '正在完成', sttLabel: '正在结束' });
    if (this.recognition && this.recognitionActive) {
      try {
        this.recognition.stop();
        return;
      } catch (error) {
        console.warn('Unable to stop recognition:', error);
      }
    }
    this.listeningRequested = false;
    if (this.recognizedText) this.routeRecognizedText(this.recognizedText);
    else this.finishWithoutSpeech();
  },

  finishWithoutSpeech() {
    this.setData({
      phase: 'idle',
      statusTitle: '没有听清',
      statusDetail: '再次唤醒后直接说出完整指令',
      transcript: '',
      sttLabel: '待命'
    });
  },

  cancelInteraction() {
    if (!this.isBusy()) return;
    this.interactionSessionId += 1;
    this.listeningRequested = false;
    this.stopRequested = false;
    this.processing = false;
    this.disposeRecognition();
    this.setData({
      phase: 'idle',
      statusTitle: '已取消',
      statusDetail: '再次唤醒后直接说出指令',
      transcript: '',
      sttLabel: '待命'
    });
  },

  onVoiceWakeup(event) {
    this.suppressAutomaticEntry = false;
    if (this.data.bindingGate) {
      this.openScanPage();
      return;
    }
    const utterance = String((event && event.keyword) || '').trim();
    const containsIntent = /记录|记|查|账|花|收|支|明细|消费/.test(utterance);
    if (utterance && utterance !== '一刻' && containsIntent) {
      if (this.isBusy()) this.cancelInteraction();
      this.routeRecognizedText(utterance);
      return;
    }
    if (!this.isBusy()) this.beginIntentListening();
  },

  suspendRecognition() {
    if (!this.recognition) return;
    const recognition = this.recognition;
    this.recognitionToken += 1;
    this.recognition = null;
    this.recognitionActive = false;
    try {
      recognition.abort();
    } catch (error) {
      console.warn('Unable to suspend recognition:', error);
    }
    if (this.listeningRequested && this.data.phase === 'listening') this.setData({ sttLabel: '已暂停' });
  },

  disposeRecognition() {
    if (!this.recognition) {
      this.recognitionToken += 1;
      this.recognitionActive = false;
      return;
    }
    const recognition = this.recognition;
    this.recognitionToken += 1;
    this.recognition = null;
    this.recognitionActive = false;
    try {
      recognition.abort();
    } catch (error) {
      console.warn('Unable to abort recognition:', error);
    }
  },

  onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;

    if (this.data.bindingGate) {
      event.preventDefault();
      if (control === CONTROL.ACTIVATE) this.openScanPage();
      return;
    }

    if (control === CONTROL.BACK) {
      if (this.isBusy()) {
        event.preventDefault();
        if (this.data.phase === 'classifying' || this.data.phase === 'searching') {
          this.setData({ statusDetail: '正在处理，请稍候' });
        } else {
          this.cancelInteraction();
        }
      }
      return;
    }

    event.preventDefault();
    if (control === CONTROL.ACTIVATE) {
      this.suppressAutomaticEntry = false;
      if (!this.isBusy()) this.beginIntentListening();
    }
  }
}
</script>

<page>
  <view class="app-shell">
    <view class="binding-gate" ink:if="{{bindingGate}}">
      <text class="binding-title">一刻</text>
      <text class="binding-status">{{statusTitle}}</text>
      <text class="binding-detail">{{statusDetail}}</text>
      <text class="binding-action">确认：扫码绑定账号</text>
      <text class="binding-version">v{{softwareVersion}} · build {{buildId}}</text>
    </view>

    <view class="main-shell" ink:if="{{bindingGate === false}}">
      <view class="top-row">
        <view class="brand-block">
          <text class="brand-title">一刻</text>
          <text class="brand-subtitle">记账助手 · 直接说</text>
        </view>
        <view class="mode-pill">
          <text>{{ phase === 'listening' ? '语音 ' + sttLabel : phase === 'classifying' || phase === 'searching' ? '处理中' : phase === 'answered' ? '记账助手' : '待命' }}</text>
        </view>
      </view>

      <card class="memory-card" role="group">
        <view class="status-row">
          <view class="voice-orb {{ phase === 'listening' || phase === 'classifying' || phase === 'searching' ? 'voice-orb-active' : '' }}">
            <text class="orb-label">{{ phase === 'listening' ? '听' : phase === 'classifying' || phase === 'searching' ? '想' : phase === 'answered' ? '答' : '说' }}</text>
          </view>
          <view class="status-copy">
            <text class="status-title">{{ statusTitle }}</text>
            <text class="status-detail">{{ statusDetail }}</text>
          </view>
        </view>

        <scroll-view class="content-scroll" scroll-y="true" scroll-into-view="{{ scrollIntoView }}">
          <text class="transcript" ink:if="{{ transcript }}">“{{ transcript }}”</text>
          <view class="answer-block" ink:if="{{ answer }}">
            <text class="answer-label">{{ answerLabel }}</text>
            <text class="answer-text">{{ answer }}</text>
          </view>

          <view id="mcp-card" class="mcp-card" ink:if="{{ mcpCard.visible }}">
            <view class="mcp-card-head">
              <text class="mcp-card-eyebrow">记账统计 · {{ mcpCard.periodLabel }}</text>
              <view class="mcp-card-head-actions">
                <text class="mcp-card-count">{{ mcpCard.count }} 笔</text>
                <text class="mcp-card-dismiss" bindtap="dismissMcpCard">收起</text>
              </view>
            </view>
            <view class="mcp-card-metrics">
              <view class="mcp-metric">
                <text class="mcp-metric-label">支出</text>
                <text class="mcp-metric-value">{{ mcpCard.expenseLabel }}</text>
              </view>
              <view class="mcp-metric">
                <text class="mcp-metric-label">收入</text>
                <text class="mcp-metric-value">{{ mcpCard.incomeLabel }}</text>
              </view>
              <view class="mcp-metric">
                <text class="mcp-metric-label">结余</text>
                <text class="mcp-metric-value">{{ mcpCard.balanceLabel }}</text>
              </view>
            </view>
            <view class="mcp-card-cats" ink:if="{{ mcpCard.topCategories.length }}">
              <view class="mcp-cat" ink:for="{{ mcpCard.topCategories }}" ink:key="category">
                <text class="mcp-cat-name">{{ item.category }}</text>
                <text class="mcp-cat-amount">{{ item.amountLabel }}</text>
              </view>
            </view>
            <button class="mcp-card-action" bindtap="openMcpDetail">查看详情</button>
          </view>
        </scroll-view>
      </card>

      <view class="intent-guide">
        <text class="guide-title">一句话即可</text>
        <text class="guide-example">“记一笔午餐 28.5 元” · “上个月花了多少”</text>
        <text class="guide-example">“看看这个月的账单” · “打开记账详情”</text>
        <text class="guide-meta">记账与统计均由远程记账服务完成</text>
      </view>
    </view>
  </view>
</page>

<style>
.app-shell {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-background);
  color: var(--color-text-primary);
}

.binding-gate {
  width: 416px;
  height: 320px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: var(--card-padding);
  border: var(--card-border-width) solid var(--card-border-color);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
}

.binding-title {
  color: var(--color-primary);
  font-size: 30px;
  line-height: 36px;
  font-weight: 700;
}

.binding-status {
  color: var(--color-text-primary);
  font-size: 18px;
  line-height: 24px;
  font-weight: 700;
}

.binding-detail {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 17px;
}

.binding-action {
  color: var(--color-primary);
  font-size: 12px;
  line-height: 17px;
  margin-top: 6px;
}

.binding-version {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.main-shell {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.top-row {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.brand-block {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  gap: 8px;
}

.brand-title {
  color: var(--color-primary);
  font-size: 22px;
  line-height: 28px;
  font-weight: 700;
}

.brand-subtitle {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 15px;
}

.mode-pill {
  padding: 3px 10px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: 999px;
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.memory-card {
  flex: 1;
  min-height: 0;
}

.status-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 12px;
  padding: var(--card-padding);
}

.voice-orb {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  border: var(--border-width-default) solid var(--border-color-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}

.voice-orb-active {
  border-color: var(--color-primary);
}

.orb-label {
  color: var(--color-primary);
  font-size: 15px;
  font-weight: 700;
}

.status-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.status-title {
  font-size: 17px;
  line-height: 23px;
  font-weight: 700;
}

.status-detail {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 17px;
}

.content-scroll {
  width: 100%;
  max-height: 148px;
}

.transcript {
  color: var(--color-primary);
  font-size: 13px;
  line-height: 19px;
  padding: 4px var(--card-padding);
}

.answer-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px var(--card-padding) var(--card-padding);
}

.answer-label {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.answer-text {
  font-size: 14px;
  line-height: 20px;
}

.mcp-card {
  margin: 4px var(--card-padding) var(--card-padding);
  padding: var(--spacing-sm);
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mcp-card-head {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.mcp-card-eyebrow {
  color: var(--color-primary);
  font-size: 12px;
  line-height: 16px;
  font-weight: 700;
}

.mcp-card-head-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.mcp-card-count {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.mcp-card-dismiss {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
  padding: 1px 6px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
}

.mcp-card-metrics {
  display: flex;
  flex-direction: row;
  gap: 6px;
}

.mcp-metric {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 5px 2px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
}

.mcp-metric-label {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.mcp-metric-value {
  font-size: 14px;
  line-height: 19px;
  font-weight: 700;
  color: var(--color-primary);
}

.mcp-card-cats {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mcp-cat {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  font-size: 11px;
  line-height: 16px;
}

.mcp-cat-name {
  color: var(--color-text-secondary);
}

.mcp-cat-amount {
  color: var(--color-primary);
}

.mcp-card-action {
  min-height: 34px;
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 34px;
  color: var(--color-background);
  background-color: var(--color-primary);
}

.intent-guide {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-md);
}

.guide-title {
  color: var(--color-primary);
  font-size: 11px;
  line-height: 15px;
  font-weight: 700;
}

.guide-example {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 15px;
}

.guide-meta {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}
</style>
