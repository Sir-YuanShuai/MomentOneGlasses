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

export default {
  data: {
    phase: 'ready',
    query: '',
    answer: '你可以问我旅行、美食或最近坚持的事情。',
    evidence: [],
    focusIndex: 0
  },

  onLoad(input) {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    if (input && input.initialQuery) {
      this.performSearch(input.initialQuery);
    }
  },

  onUnload() {
    this.disposeRecognition();
  },

  startVoiceSearch() {
    if (this.data.phase === 'listening' || this.data.phase === 'searching') return;
    this.ignoreRecognitionEnd = false;
    this.setData({
      phase: 'listening',
      query: '',
      answer: '正在听，请说出你想回忆的内容。',
      evidence: []
    });

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      this.recognizedText = '';

      recognition.onresult = (event) => {
        const transcript = this.extractTranscript(event);
        if (transcript) {
          this.recognizedText = transcript;
          this.setData({ query: transcript });
        }
      };
      recognition.onerror = (event) => {
        console.warn('Search recognition error:', event && event.message);
      };
      recognition.onend = () => {
        this.recognitionActive = false;
        if (this.ignoreRecognitionEnd) {
          this.ignoreRecognitionEnd = false;
          return;
        }
        if (this.recognizedText) this.performSearch(this.recognizedText);
        else this.setData({ phase: 'ready', answer: '没有听清。请再说一次，或选择下面的问题。' });
      };

      this.recognition = recognition;
      this.recognitionActive = true;
      recognition.start();
    } catch (error) {
      console.warn('Voice search unavailable:', error);
      this.setData({ phase: 'ready', answer: '当前无法使用语音识别，请选择下面的问题。' });
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
    if (!this.recognition || !this.recognitionActive) return;
    try {
      this.recognition.stop();
    } catch (error) {
      console.warn('Unable to stop voice search:', error);
    }
  },

  handleVoiceAction() {
    if (this.data.phase === 'listening') this.stopVoiceSearch();
    else this.startVoiceSearch();
  },

  async performSearch(question) {
    if (!question || this.data.phase === 'searching') return;
    this.ignoreRecognitionEnd = true;
    this.disposeRecognition();
    this.setData({
      phase: 'searching',
      query: question,
      answer: '正在从你的生活记忆中查找…',
      evidence: []
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
    wx.navigateBack();
  },

  disposeRecognition() {
    if (!this.recognition) return;
    try {
      if (this.recognitionActive) this.recognition.abort();
    } catch (error) {
      console.warn('Unable to abort search recognition:', error);
    }
    this.recognition = null;
    this.recognitionActive = false;
  },

  activateFocused() {
    if (this.data.focusIndex === 0) this.handleVoiceAction();
    if (this.data.focusIndex === 1) this.searchTravel();
    if (this.data.focusIndex === 2) this.searchFood();
    if (this.data.focusIndex === 3) this.searchHabit();
    if (this.data.focusIndex === 4) this.goBack();
  },

  onKeyUp(event) {
    if (event.code === 'Enter') {
      event.preventDefault();
      this.activateFocused();
      return;
    }
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      event.preventDefault();
      const delta = event.code === 'ArrowDown' ? 1 : -1;
      this.setData({ focusIndex: (this.data.focusIndex + delta + 5) % 5 });
    }
  }
}
</script>

<page>
  <view class="app-shell">
    <view class="header-row">
      <view class="header-copy">
        <text class="eyebrow">AI MEMORY SEARCH</text>
        <text class="page-title">问问你的记忆</text>
      </view>
      <button class="voice-action {{ focusIndex === 0 ? 'is-focused' : '' }}" bindtap="handleVoiceAction">
        {{ phase === 'listening' ? '完成提问' : '语音提问' }}
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
  padding: var(--spacing-md);
  background-color: var(--color-background);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.header-row {
  height: 48px;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.header-copy {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.eyebrow, .evidence-meta {
  color: var(--color-text-secondary);
}

.eyebrow {
  font-size: 9px;
  line-height: 12px;
}

.page-title {
  font-size: 20px;
  line-height: 25px;
  font-weight: 700;
}

.voice-action {
  width: 94px;
  height: 38px;
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
  height: 190px;
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
  height: 102px;
}

.evidence-row {
  width: 100%;
  box-sizing: border-box;
  padding: 5px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
  display: flex;
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
  height: 42px;
  display: flex;
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
  flex-grow: 1;
}

.back-action {
  width: 100%;
}

.is-focused {
  outline: var(--border-width-strong) solid var(--border-color-accent);
  outline-offset: 2px;
}
</style>
