<script def>
{
  "navigationBarTitleText": "一刻",
  "description": "记录当前第一视角画面与用户语音，生成一个包含摘要、分类和标签的生活 Moment。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "locationName": {
          "type": "string",
          "description": "宿主或上游 Agent 提供的当前地点名称"
        },
        "localDebug": {
          "type": "string",
          "description": "仅本地 Ink Web 调试使用的能力桥接开关"
        },
        "localDebugPhotoEndpoint": {
          "type": "string",
          "description": "仅本地调试使用的预置照片读取地址"
        }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { SpeechRecognition } from 'speech';
import { analyzeMoment } from '../../services/moment-ai.js';
import { saveMoment } from '../../services/memory-store.js';
import { presentMoment } from '../../services/format.js';

export default {
  data: {
    phase: 'idle',
    statusTitle: '准备记录这一刻',
    statusDetail: '说“记录一下”，或按下确认键开始',
    transcript: '',
    photoCaptured: false,
    locationName: '',
    localDebug: false,
    localDebugPhotoEndpoint: '',
    lastMoment: null,
    focusIndex: 0,
    errorMessage: ''
  },

  onLoad(input) {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    if (input) {
      this.setData({
        locationName: input.locationName || '',
        localDebug: input.localDebug === true || input.localDebug === 'true',
        localDebugPhotoEndpoint: input.localDebugPhotoEndpoint || ''
      });
    }
  },

  onUnload() {
    this.disposeRecognition();
  },

  async startRecord() {
    if (this.data.phase === 'listening' || this.data.phase === 'understanding') return;

    this.recordStartedAt = new Date().toISOString();
    this.finalizing = false;
    this.recognizedText = '';
    this.setData({
      phase: 'listening',
      statusTitle: '正在感知这一刻',
      statusDetail: '请自然说出发生了什么',
      transcript: '',
      photoCaptured: false,
      lastMoment: null,
      errorMessage: ''
    });

    this.photoPromise = this.capturePhoto();
    this.startRecognition();
  },

  async capturePhoto() {
    if (this.data.localDebug && this.data.localDebugPhotoEndpoint) {
      return this.captureLocalDebugPhoto();
    }

    try {
      const camera = wx.media.createCameraContext();
      if (!camera) return null;
      const photo = await camera.takePhoto({ quality: 'high' });
      const base64 = wx.arrayBufferToBase64(photo.data);
      const mimeType = photo.mimeType || 'image/jpeg';
      const imageDataUrl = `data:${mimeType};base64,${base64}`;
      this.setData({ photoCaptured: true });
      return { mimeType, imageDataUrl };
    } catch (error) {
      console.warn('Camera capture unavailable:', error);
      return null;
    }
  },

  async captureLocalDebugPhoto() {
    try {
      const response = await fetch(this.data.localDebugPhotoEndpoint, {
        cache: 'no-store'
      });
      if (!response.ok) {
        console.warn('Local debug photo unavailable:', response.status);
        return null;
      }

      const payload = JSON.parse(await response.text());
      if (!payload.base64) return null;
      const mimeType = payload.mimeType || 'image/jpeg';
      this.setData({ photoCaptured: true });
      return {
        mimeType,
        imageDataUrl: `data:${mimeType};base64,${payload.base64}`
      };
    } catch (error) {
      console.warn('Local debug photo bridge unavailable:', error);
      return null;
    }
  },

  createId() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
      return cryptoApi.randomUUID();
    }
    return `moment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },

  startRecognition() {
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        const transcript = this.extractTranscript(event);
        if (transcript) {
          this.recognizedText = transcript;
          this.setData({ transcript });
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event && event.message);
      };

      recognition.onend = () => {
        this.recognitionActive = false;
        this.finalizeRecord(this.recognizedText);
      };

      this.recognition = recognition;
      this.recognitionActive = true;
      recognition.start();
    } catch (error) {
      console.warn('Speech recognition unavailable:', error);
      this.recognitionActive = false;
      this.finalizeRecord('');
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

  stopRecord() {
    if (this.data.phase !== 'listening') return;
    this.setData({ statusDetail: '正在完成记录' });
    if (this.recognition && this.recognitionActive) {
      try {
        this.recognition.stop();
        return;
      } catch (error) {
        console.warn('Unable to stop recognition:', error);
      }
    }
    this.finalizeRecord(this.recognizedText || '');
  },

  async finalizeRecord(voiceInput) {
    if (this.finalizing || this.data.phase !== 'listening') return;
    this.finalizing = true;
    this.setData({
      phase: 'understanding',
      statusTitle: '正在整理记忆',
      statusDetail: '理解画面、语音并生成摘要'
    });

    try {
      const photo = this.photoPromise ? await this.photoPromise : null;
      const timestamp = this.recordStartedAt || new Date().toISOString();
      const location = {
        name: this.data.locationName || '',
        source: this.data.locationName ? 'device' : 'unknown'
      };
      const analysis = await analyzeMoment({
        voiceInput,
        timestamp,
        location,
        hasImage: Boolean(photo),
        imageDataUrl: photo && photo.imageDataUrl
      });
      const now = new Date().toISOString();
      const moment = {
        id: this.createId(),
        userId: 'local-user',
        title: analysis.title,
        occurredAt: timestamp,
        timezone: 'Asia/Shanghai',
        location,
        media: photo ? [{
          id: this.createId(),
          type: 'image',
          mimeType: photo.mimeType,
          localDataUrl: photo.imageDataUrl
        }] : [],
        voiceInput: voiceInput || '',
        description: analysis.description,
        category: analysis.category,
        tags: analysis.tags,
        emotion: analysis.emotion,
        aiSummary: analysis.aiSummary,
        confidence: analysis.confidence,
        metadata: {
          source: 'rokid-aiui',
          aiMode: analysis.aiMode,
          promptVersion: 'moment-understanding-v1'
        },
        createdAt: now,
        updatedAt: now
      };

      saveMoment(moment);
      this.setData({
        phase: 'saved',
        statusTitle: '这一刻，已记住',
        statusDetail: analysis.aiMode === 'fallback' ? '已使用离线理解完成记录' : '已生成摘要与标签',
        transcript: voiceInput || '',
        lastMoment: presentMoment(moment),
        focusIndex: 0
      });
      try {
        wx.speech.playTTS('这一刻，已经记住了');
      } catch (ttsError) {
        console.warn('TTS unavailable:', ttsError);
      }
    } catch (error) {
      console.error('Unable to save Moment:', error);
      this.finalizing = false;
      this.setData({
        phase: 'error',
        statusTitle: '暂时没有保存成功',
        statusDetail: '请重新记录一次',
        errorMessage: String(error && error.message ? error.message : error)
      });
    }
  },

  disposeRecognition() {
    if (!this.recognition) return;
    try {
      this.recognition.abort();
    } catch (error) {
      console.warn('Unable to abort recognition:', error);
    }
    this.recognition = null;
    this.recognitionActive = false;
  },

  openTimeline() {
    wx.navigateTo({ url: '/pages/timeline/timeline' });
  },

  openSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  handlePrimaryAction() {
    if (this.data.phase === 'listening') this.stopRecord();
    else this.startRecord();
  },

  activateFocused() {
    if (this.data.focusIndex === 0) this.handlePrimaryAction();
    if (this.data.focusIndex === 1) this.openTimeline();
    if (this.data.focusIndex === 2) this.openSearch();
  },

  onVoiceWakeup() {
    if (this.data.phase !== 'listening' && this.data.phase !== 'understanding') {
      this.startRecord();
    }
  },

  onKeyUp(event) {
    if (event.code === 'GlobalHook' && this.data.phase !== 'listening') {
      event.preventDefault();
      this.startRecord();
      return;
    }
    if (event.code === 'Enter') {
      event.preventDefault();
      if (this.data.phase === 'listening') this.stopRecord();
      else this.activateFocused();
      return;
    }
    if (event.code === 'ArrowDown' || event.code === 'ArrowUp') {
      event.preventDefault();
      const delta = event.code === 'ArrowDown' ? 1 : -1;
      this.setData({ focusIndex: (this.data.focusIndex + delta + 3) % 3 });
      return;
    }
    if (event.code === 'Backspace' && this.data.phase === 'listening') {
      event.preventDefault();
      this.disposeRecognition();
      this.setData({
        phase: 'idle',
        statusTitle: '已取消记录',
        statusDetail: '需要时再告诉我'
      });
    }
  }
}
</script>

<page>
  <view class="app-shell">
    <view class="brand-row">
      <view class="brand-mark"><text>一刻</text></view>
      <view class="brand-copy">
        <text class="brand-title">Moment One</text>
        <text class="brand-subtitle">AI 替你记住人生</text>
      </view>
      <text class="phase-label">{{ phase === 'listening' ? '感知中' : phase === 'understanding' ? '理解中' : '记忆系统' }}</text>
    </view>

    <card class="record-card" role="group">
      <view class="status-row">
        <view class="pulse-ring {{ phase === 'listening' || phase === 'understanding' ? 'pulse-active' : '' }}">
          <text class="pulse-core">{{ phase === 'saved' ? '存' : phase === 'listening' ? '听' : phase === 'understanding' ? '想' : '记' }}</text>
        </view>
        <view class="status-copy">
          <text class="status-title">{{ statusTitle }}</text>
          <text class="status-detail">{{ statusDetail }}</text>
        </view>
      </view>

      <view class="capture-meta" ink:if="{{ phase === 'listening' || phase === 'understanding' }}">
        <text class="meta-item">画面 {{ photoCaptured ? '已捕捉' : '采集中' }}</text>
        <text class="meta-divider">·</text>
        <text class="meta-item">位置 {{ locationName ? locationName : '未提供' }}</text>
      </view>

      <text class="transcript" ink:if="{{ transcript }}">“{{ transcript }}”</text>

      <view class="moment-preview" ink:if="{{ lastMoment }}">
        <view class="category-mark"><text>{{ lastMoment.categoryMark }}</text></view>
        <view class="moment-copy">
          <text class="moment-title">{{ lastMoment.title }}</text>
          <text class="moment-summary">{{ lastMoment.aiSummary }}</text>
          <text class="moment-tags">{{ lastMoment.tagsText }}</text>
        </view>
      </view>

      <view class="error-row" ink:if="{{ errorMessage }}">
        <text>{{ errorMessage }}</text>
      </view>
    </card>

    <view class="action-row">
      <button class="primary-action {{ focusIndex === 0 ? 'is-focused' : '' }}" bindtap="handlePrimaryAction">
        {{ phase === 'listening' ? '完成记录' : phase === 'saved' ? '再记一刻' : '记录这一刻' }}
      </button>
      <button class="secondary-action {{ focusIndex === 1 ? 'is-focused' : '' }}" bindtap="openTimeline">时间线</button>
      <button class="secondary-action {{ focusIndex === 2 ? 'is-focused' : '' }}" bindtap="openSearch">问记忆</button>
    </view>
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

.brand-row {
  width: 100%;
  height: 46px;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.brand-mark {
  width: 42px;
  height: 42px;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
}

.brand-copy {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-size: 18px;
  line-height: 22px;
  font-weight: 700;
}

.brand-subtitle, .phase-label, .status-detail, .meta-item, .meta-divider, .moment-tags {
  color: var(--color-text-secondary);
}

.brand-subtitle, .phase-label {
  font-size: 11px;
  line-height: 16px;
}

.phase-label {
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
  padding: 3px 7px;
}

.record-card {
  width: 100%;
  height: 208px;
  box-sizing: border-box;
  padding: var(--card-padding);
  border: var(--card-border-width) solid var(--card-border-color);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.status-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
}

.pulse-ring {
  width: 54px;
  height: 54px;
  border: var(--border-width-default) solid var(--border-color-muted);
  border-radius: 27px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 var(--border-width-thin) var(--color-primary-40);
}

.pulse-active {
  border-color: var(--border-color-accent);
  box-shadow: 0 0 12px var(--color-primary-60);
}

.pulse-core {
  color: var(--color-primary);
  font-size: 18px;
  font-weight: 700;
}

.status-copy, .moment-copy {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.status-title {
  font-size: 19px;
  line-height: 24px;
  font-weight: 700;
}

.status-detail, .moment-summary {
  font-size: 12px;
  line-height: 17px;
}

.capture-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
}

.meta-item, .meta-divider {
  font-size: 11px;
  line-height: 15px;
}

.transcript {
  color: var(--color-primary);
  font-size: 13px;
  line-height: 18px;
}

.moment-preview {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 7px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
}

.category-mark {
  width: 34px;
  height: 34px;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: 17px;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 700;
}

.moment-title {
  font-size: 14px;
  line-height: 18px;
  font-weight: 700;
}

.moment-summary, .moment-tags {
  font-size: 11px;
  line-height: 15px;
}

.error-row {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 15px;
}

.action-row {
  width: 100%;
  height: 54px;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.primary-action, .secondary-action {
  height: 42px;
  box-sizing: border-box;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 18px;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.primary-action {
  flex-grow: 1;
  color: var(--color-background);
  background-color: var(--color-primary);
  border: var(--border-width-default) solid var(--border-color-accent);
  font-weight: 700;
}

.secondary-action {
  width: 84px;
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  border: var(--border-width-default) solid var(--border-color-muted);
}

.is-focused {
  outline: var(--border-width-strong) solid var(--border-color-accent);
  outline-offset: 2px;
}
</style>
