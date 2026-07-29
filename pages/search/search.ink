<script def>
{
  "navigationBarTitleText": "问问记忆",
  "description": "通过语音或常用问题查询用户的 Moment，并基于检索到的生活记忆生成回答。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "initialQuery": {
          "type": "string",
          "description": "进入页面后可直接执行的记忆查询"
        },
        "initialListen": {
          "type": "string",
          "description": "进入页面后立即开始 STT 监听，供四键和语音唤醒流程使用"
        }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { SpeechRecognition } from 'speech';
import { searchMoments } from '../../services/memory-store.js';
import { presentTimeline } from '../../services/format.js';
import { answerMemoryQuestion } from '../../services/moment-ai.js';
import { CONTROL, moveFocus, resolveControl } from '../../services/controls.js';

export default {
  data: {
    phase: 'ready',
    query: '',
    answer: '上下选择常用问题，点击键确认；语音唤醒可直接提问。',
    evidence: [],
    focusIndex: 0,
    sttLabel: '待命'
  },

  onLoad(input) {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.pageVisible = true;
    this.listeningRequested = false;
    this.recognitionActive = false;
    this.recognitionToken = 0;
    this.pendingInitialListen = Boolean(input && (input.initialListen === true || input.initialListen === 'true'));
    if (input && input.initialQuery) {
      this.pendingInitialListen = false;
      this.performSearch(input.initialQuery);
    }
  },

  onShow() {
    this.pageVisible = true;
    if (this.pendingInitialListen) {
      this.pendingInitialListen = false;
      this.startVoiceSearch();
      return;
    }
    if (this.data.phase === 'listening' && this.listeningRequested && !this.recognitionActive) {
      this.startRecognition();
    }
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

  startVoiceSearch() {
    if (this.data.phase === 'listening' || this.data.phase === 'searching') return;
    this.stopRequested = false;
    this.listeningRequested = true;
    this.recognitionFailed = false;
    this.recognizedText = '';
    this.setData({
      phase: 'listening',
      query: '',
      answer: '正在听。说完后按点击键，返回键取消。',
      evidence: [],
      focusIndex: 0,
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
        if (transcript) {
          this.recognizedText = transcript;
          this.setData({ query: transcript, sttLabel: '已收到输入' });
        }
      };

      recognition.onerror = (event) => {
        if (token !== this.recognitionToken) return;
        this.recognitionFailed = true;
        console.warn('Search recognition error:', event && (event.error || event.message));
        this.setData({
          sttLabel: '暂不可用',
          answer: '语音暂不可用，请用上下键选择常用问题。'
        });
      };

      recognition.onend = () => {
        if (token !== this.recognitionToken) return;
        this.recognitionActive = false;
        this.recognition = null;

        if (!this.listeningRequested || this.data.phase !== 'listening') return;
        if (this.recognizedText) {
          const question = this.recognizedText;
          this.listeningRequested = false;
          this.performSearch(question);
          return;
        }
        if (this.stopRequested) {
          this.listeningRequested = false;
          this.setData({
            phase: 'ready',
            answer: '没有听清。请再次语音唤醒，或选择下面的问题。',
            sttLabel: '待命'
          });
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
      console.warn('Voice search unavailable:', error);
      this.recognition = null;
      this.recognitionActive = false;
      this.recognitionFailed = true;
      this.setData({
        sttLabel: '暂不可用',
        answer: '语音暂不可用，请用上下键选择常用问题。'
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

  stopVoiceSearch() {
    if (this.data.phase !== 'listening') return;
    this.stopRequested = true;
    this.setData({ answer: '正在完成提问…', sttLabel: '正在结束' });
    if (this.recognition && this.recognitionActive) {
      try {
        this.recognition.stop();
        return;
      } catch (error) {
        console.warn('Unable to stop voice search:', error);
      }
    }

    if (this.recognizedText) {
      const question = this.recognizedText;
      this.listeningRequested = false;
      this.performSearch(question);
    } else {
      this.cancelVoiceSearch();
    }
  },

  cancelVoiceSearch() {
    if (this.data.phase !== 'listening') return;
    this.listeningRequested = false;
    this.stopRequested = false;
    this.disposeRecognition();
    this.setData({
      phase: 'ready',
      query: '',
      answer: '已取消提问。上下选择常用问题，点击键确认。',
      sttLabel: '待命'
    });
  },

  handleVoiceAction() {
    if (this.data.phase === 'listening') this.stopVoiceSearch();
    else if (this.data.phase !== 'searching') this.startVoiceSearch();
  },

  async performSearch(question) {
    if (!question || this.data.phase === 'searching') return;
    this.listeningRequested = false;
    this.disposeRecognition();
    this.setData({
      phase: 'searching',
      query: question,
      answer: '正在从你的生活记忆中查找…',
      evidence: [],
      sttLabel: '待命'
    });

    const matches = searchMoments(question, 5);
    const evidence = presentTimeline(matches).map((moment) => ({ ...moment, showDate: false }));
    this.setData({ evidence });
    const answer = await answerMemoryQuestion(question, matches);
    this.setData({ phase: 'answered', answer });
  },

  searchTravel() {
    this.performSearch('我的旅行记录');
  },

  searchFood() {
    this.performSearch('最近吃过什么');
  },

  searchHabit() {
    this.performSearch('最近坚持了什么习惯');
  },

  goBack() {
    if (this.data.phase === 'searching') return;
    wx.navigateBack({ delta: 1 });
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
      console.warn('Unable to suspend search recognition:', error);
    }
    if (this.listeningRequested && this.data.phase === 'listening') {
      this.setData({ sttLabel: '已暂停' });
    }
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
      console.warn('Unable to abort search recognition:', error);
    }
  },

  activateFocused() {
    if (this.data.phase === 'listening') {
      this.stopVoiceSearch();
      return;
    }
    if (this.data.phase === 'searching') return;
    if (this.data.focusIndex === 0) this.handleVoiceAction();
    if (this.data.focusIndex === 1) this.searchTravel();
    if (this.data.focusIndex === 2) this.searchFood();
    if (this.data.focusIndex === 3) this.searchHabit();
    if (this.data.focusIndex === 4) this.goBack();
  },

  onVoiceWakeup(event) {
    console.log('Memory search voice wakeup:', event && event.keyword);
    if (this.data.phase !== 'listening' && this.data.phase !== 'searching') {
      this.startVoiceSearch();
    }
  },

  onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;

    if (control === CONTROL.BACK) {
      event.preventDefault();
      if (this.data.phase === 'listening') this.cancelVoiceSearch();
      else if (this.data.phase !== 'searching') this.goBack();
      else this.setData({ answer: '正在查找，请稍候。' });
      return;
    }

    event.preventDefault();
    if (control === CONTROL.ACTIVATE) {
      this.activateFocused();
      return;
    }
    if (this.data.phase === 'listening' || this.data.phase === 'searching') return;

    const delta = control === CONTROL.NEXT ? 1 : -1;
    this.setData({ focusIndex: moveFocus(this.data.focusIndex, 5, delta) });
  }
}
</script>

<page>
  <view class="app-shell">
    <view class="header-row">
      <view class="header-copy">
        <text class="eyebrow">AI MEMORY SEARCH</text>
        <text class="page-title">问问你的记忆</text>
        <text class="stt-status">STT {{ sttLabel }}</text>
      </view>
      <button class="voice-action {{ focusIndex === 0 ? 'is-focused' : '' }}" bindtap="handleVoiceAction">
        {{ phase === 'listening' ? '点击完成' : '语音提问' }}
      </button>
    </view>

    <card class="answer-card" role="group">
      <text class="query-label" ink:if="{{ query }}">“{{ query }}”</text>
      <text class="answer-text">{{ answer }}</text>

      <scroll-view class="evidence-scroll" scroll-y="true" ink:if="{{ evidence.length > 0 }}">
        <view class="evidence-row" ink:for="{{ evidence }}" ink:key="id">
          <view class="evidence-mark"><text>{{ item.categoryMark }}</text></view>
          <view class="evidence-copy">
            <text class="evidence-title">{{ item.title }}</text>
            <text class="evidence-meta">{{ item.fullTimeLabel }} · {{ item.categoryLabel }}</text>
          </view>
        </view>
      </scroll-view>
    </card>

    <view class="suggestion-row">
      <button class="suggestion {{ focusIndex === 1 ? 'is-focused' : '' }}" bindtap="searchTravel">旅行记录</button>
      <button class="suggestion {{ focusIndex === 2 ? 'is-focused' : '' }}" bindtap="searchFood">最近吃过什么</button>
      <button class="suggestion {{ focusIndex === 3 ? 'is-focused' : '' }}" bindtap="searchHabit">坚持的习惯</button>
    </view>

    <button class="back-action {{ focusIndex === 4 ? 'is-focused' : '' }}" bindtap="goBack">返回</button>
  </view>
</page>

<style>
.app-shell {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  padding: 10px 12px;
  background-color: var(--color-background);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-row {
  height: 44px;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-sm);
}

.header-copy {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.eyebrow, .evidence-meta, .stt-status {
  color: var(--color-text-secondary);
}

.eyebrow, .stt-status {
  font-size: 8px;
  line-height: 9px;
}

.page-title {
  font-size: 18px;
  line-height: 21px;
  font-weight: 700;
}

.voice-action {
  width: 88px;
  height: 34px;
  box-sizing: border-box;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: var(--radius-md);
  color: var(--color-background);
  background-color: var(--color-primary);
  font-size: 12px;
  line-height: 16px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.answer-card {
  width: 100%;
  height: 158px;
  box-sizing: border-box;
  padding: var(--card-padding);
  border: var(--card-border-width) solid var(--card-border-color);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.query-label {
  color: var(--color-primary);
  font-size: 12px;
  line-height: 16px;
}

.answer-text {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
}

.evidence-scroll {
  width: 100%;
  height: 76px;
}

.evidence-row {
  width: 100%;
  box-sizing: border-box;
  padding: 5px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-sm);
  margin: 0 0 5px 0;
}

.evidence-mark {
  width: 26px;
  height: 26px;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: 13px;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.evidence-copy {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.evidence-title {
  font-size: 12px;
  line-height: 16px;
  font-weight: 700;
}

.evidence-meta {
  font-size: 9px;
  line-height: 13px;
}

.suggestion-row {
  height: 38px;
  display: flex;
  flex-direction: row;
  gap: 6px;
}

.suggestion, .back-action {
  height: 36px;
  box-sizing: border-box;
  border: var(--border-width-default) solid var(--border-color-muted);
  border-radius: var(--radius-md);
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  font-size: 11px;
  line-height: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.suggestion {
  width: 132px;
}

.back-action {
  width: 100%;
}

.is-focused {
  outline: var(--border-width-strong) solid var(--border-color-accent);
  outline-offset: 2px;
}
</style>
