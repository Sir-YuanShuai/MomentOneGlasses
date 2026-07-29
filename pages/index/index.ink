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
import { CONTROL, moveFocus, resolveControl } from '../../services/controls.js';

export default {
  data: {
    phase: 'idle',
    statusTitle: '准备记录这一刻',
    statusDetail: '上下选择，点击键确认；语音唤醒可直接开始',
    transcript: '',
    photoCaptured: false,
    locationName: '',
    localDebug: false,
    localDebugPhotoEndpoint: '',
    lastMoment: {
      categoryMark: '',
      title: '',
      aiSummary: '',
      tagsText: ''
    },
    hasLastMoment: false,
    focusIndex: 0,
    sttLabel: '待命',
    errorMessage: ''
  },

  onLoad(input) {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.pageVisible = true;
    this.listeningRequested = false;
    this.recognitionActive = false;
    this.recognitionToken = 0;
    if (input) {
      this.setData({
        locationName: input.locationName || '',
        localDebug: input.localDebug === true || input.localDebug === 'true',
        localDebugPhotoEndpoint: input.localDebugPhotoEndpoint || ''
      });
    }
  },

  onShow() {
    this.pageVisible = true;
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

  async startRecord() {
    if (this.data.phase === 'listening' || this.data.phase === 'understanding') return;

    this.recordStartedAt = new Date().toISOString();
    this.recordSessionId = (this.recordSessionId || 0) + 1;
    this.finalizing = false;
    this.stopRequested = false;
    this.listeningRequested = true;
    this.recognitionFailed = false;
    this.recognizedText = '';
    this.setData({
      phase: 'listening',
      statusTitle: '正在感知这一刻',
      statusDetail: '说完后按点击键；返回键取消',
      transcript: '',
      photoCaptured: false,
      hasLastMoment: false,
      focusIndex: 0,
      sttLabel: '连接中',
      errorMessage: ''
    });

    this.photoPromise = this.capturePhoto(this.recordSessionId);
    this.startRecognition();
  },

  async capturePhoto(sessionId) {
    if (this.data.localDebug && this.data.localDebugPhotoEndpoint) {
      return this.captureLocalDebugPhoto(sessionId);
    }

    try {
      const camera = wx.media.createCameraContext();
      if (!camera) return null;
      const photo = await camera.takePhoto({ quality: 'high' });
      const base64 = wx.arrayBufferToBase64(photo.data);
      const mimeType = photo.mimeType || 'image/jpeg';
      const imageDataUrl = `data:${mimeType};base64,${base64}`;
      if (sessionId === this.recordSessionId && this.data.phase !== 'idle') {
        this.setData({ photoCaptured: true });
      }
      return { mimeType, imageDataUrl };
    } catch (error) {
      console.warn('Camera capture unavailable:', error);
      return null;
    }
  },

  async captureLocalDebugPhoto(sessionId) {
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
      if (sessionId === this.recordSessionId && this.data.phase !== 'idle') {
        this.setData({ photoCaptured: true });
      }
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
          this.setData({ transcript, sttLabel: '已收到输入' });
        }
      };

      recognition.onerror = (event) => {
        if (token !== this.recognitionToken) return;
        this.recognitionFailed = true;
        console.warn('Speech recognition error:', event && (event.error || event.message));
        this.setData({
          sttLabel: '暂不可用',
          statusDetail: '语音不可用时，点击键仍可保存基础记录'
        });
      };

      recognition.onend = () => {
        if (token !== this.recognitionToken) return;
        this.recognitionActive = false;
        this.recognition = null;

        if (!this.listeningRequested || this.data.phase !== 'listening') return;
        if (this.stopRequested || this.recognizedText) {
          this.listeningRequested = false;
          this.finalizeRecord(this.recognizedText || '');
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
        statusDetail: '语音不可用时，点击键仍可保存基础记录'
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

  stopRecord() {
    if (this.data.phase !== 'listening') return;
    this.stopRequested = true;
    this.setData({ statusDetail: '正在完成记录', sttLabel: '正在结束' });
    if (this.recognition && this.recognitionActive) {
      try {
        this.recognition.stop();
        return;
      } catch (error) {
        console.warn('Unable to stop recognition:', error);
      }
    }
    this.listeningRequested = false;
    this.finalizeRecord(this.recognizedText || '');
  },

  cancelRecord() {
    if (this.data.phase !== 'listening') return;
    this.listeningRequested = false;
    this.stopRequested = false;
    this.recordSessionId = (this.recordSessionId || 0) + 1;
    this.disposeRecognition();
    this.setData({
      phase: 'idle',
      statusTitle: '已取消记录',
      statusDetail: '上下选择，点击键确认；语音唤醒可直接开始',
      transcript: '',
      photoCaptured: false,
      sttLabel: '待命',
      errorMessage: ''
    });
  },

  async finalizeRecord(voiceInput) {
    if (this.finalizing || this.data.phase !== 'listening') return;
    this.finalizing = true;
    this.listeningRequested = false;
    this.disposeRecognition();
    this.setData({
      phase: 'understanding',
      statusTitle: '正在整理记忆',
      statusDetail: '理解画面、语音并生成摘要',
      sttLabel: '已结束'
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
        hasLastMoment: true,
        focusIndex: 0,
        sttLabel: '待命'
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
        statusDetail: '选择记录这一刻后重试',
        sttLabel: '待命',
        errorMessage: String(error && error.message ? error.message : error)
      });
    }
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
      console.warn('Unable to abort recognition:', error);
    }
  },

  openTimeline() {
    if (this.data.phase === 'listening' || this.data.phase === 'understanding') return;
    wx.navigateTo({ url: '/pages/timeline/timeline' });
  },

  openSearch() {
    if (this.data.phase === 'listening' || this.data.phase === 'understanding') return;
    wx.navigateTo({ url: '/pages/search/search' });
  },

  handlePrimaryAction() {
    if (this.data.phase === 'listening') this.stopRecord();
    else if (this.data.phase !== 'understanding') this.startRecord();
  },

  activateFocused() {
    if (this.data.phase === 'listening') {
      this.stopRecord();
      return;
    }
    if (this.data.phase === 'understanding') return;
    if (this.data.focusIndex === 0) this.handlePrimaryAction();
    if (this.data.focusIndex === 1) this.openTimeline();
    if (this.data.focusIndex === 2) this.openSearch();
  },

  onVoiceWakeup(event) {
    console.log('Moment One voice wakeup:', event && event.keyword);
    if (this.data.phase !== 'listening' && this.data.phase !== 'understanding') {
      this.startRecord();
    }
  },

  onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;

    if (control === CONTROL.BACK) {
      if (this.data.phase === 'listening') {
        event.preventDefault();
        this.cancelRecord();
      } else if (this.data.phase === 'understanding') {
        event.preventDefault();
        this.setData({ statusDetail: '正在保存，请稍候' });
      }
      return;
    }

    event.preventDefault();
    if (control === CONTROL.ACTIVATE) {
      this.activateFocused();
      return;
    }
    if (this.data.phase === 'listening' || this.data.phase === 'understanding') return;

    const delta = control === CONTROL.NEXT ? 1 : -1;
    this.setData({ focusIndex: moveFocus(this.data.focusIndex, 3, delta) });
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
      <text class="phase-label">{{ phase === 'listening' ? 'STT ' + sttLabel : phase === 'understanding' ? '理解中' : '上下选择' }}</text>
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
        <text class="meta-item">语音 {{ sttLabel }}</text>
        <text class="meta-divider">·</text>
        <text class="meta-item">画面 {{ photoCaptured ? '已捕捉' : '采集中' }}</text>
        <text class="meta-divider">·</text>
        <text class="meta-item">位置 {{ locationName ? locationName : '未提供' }}</text>
      </view>

      <text class="transcript" ink:if="{{ transcript }}">“{{ transcript }}”</text>

      <view class="moment-preview" ink:if="{{ hasLastMoment }}">
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
  flex-direction: row;
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

.status-row {
  display: flex;
  flex-direction: row;
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
  flex-direction: row;
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
  flex-direction: row;
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
  flex-direction: row;
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
  width: 220px;
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
