<script def>
{
  "navigationBarTitleText": "一刻",
  "description": "通过统一语音入口自动识别记录、查询、回顾和设置意图，并处理用户自己的 Moment。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "locationName": {
          "type": "string",
          "description": "宿主或上游 Agent 提供的当前地点名称"
        },
        "initialAction": {
          "type": "string",
          "description": "可选的首个动作：record 或 search"
        },
        "initialQuery": {
          "type": "string",
          "description": "可选的首个记忆查询"
        },
        "initialUtterance": {
          "type": "string",
          "description": "可选的首句自然语言指令，由页面直接识别意图"
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
import { analyzeMoment, answerMemoryQuestion, MOMENT_PROMPT_VERSION } from '../../services/moment-ai.js';
import { runAgentTurn } from '../../services/agent-loop.js';
import {
  clearMoments,
  deleteMoment,
  listMoments,
  saveMoment,
  searchMoments,
  updateMoment
} from '../../services/memory-store.js';
import { presentMoment } from '../../services/format.js';
import {
  AUDIO_RECORDING_DURATION_MS,
  resolveRecordMediaChoice,
  VIDEO_RECORDING_SUPPORTED
} from '../../services/record-media.js';
import { CONTROL, resolveControl } from '../../services/controls.js';

const INSTANT_MEMORY_KEY = 'moment-one:instant-memory:v1';

export default {
  data: {
    phase: 'idle',
    interactionMode: 'intent',
    statusTitle: '请直接说出你的意图',
    statusDetail: '记录、查询、回顾和设置都会自动识别',
    transcript: '',
    photoCaptured: false,
    photoStatus: '待命',
    photoPreviewUrl: '',
    audioStatus: '未录音',
    instantMemoryEnabled: true,
    locationName: '',
    localDebug: false,
    localDebugPhotoEndpoint: '',
    recentCount: 0,
    answer: '',
    answerLabel: '意图识别',
    evidenceCount: 0,
    lastMoment: {
      categoryMark: '',
      title: '',
      aiSummary: '',
      tagsText: ''
    },
    hasLastMoment: false,
    sttLabel: '待命',
    errorMessage: ''
  },

  onLoad(input) {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.pageVisible = true;
    this.listeningRequested = false;
    this.recognitionActive = false;
    this.recognitionToken = 0;
    this.interactionSessionId = 0;
    this.processing = false;
    this.pendingPhoto = null;
    this.pendingAudio = null;
    this.pendingAction = null;
    this.audioRecorder = null;

    let instantMemoryEnabled = true;
    try {
      const storedPreference = wx.getStorageSync(INSTANT_MEMORY_KEY);
      if (typeof storedPreference === 'boolean') instantMemoryEnabled = storedPreference;
    } catch (error) {
      console.warn('Instant memory preference unavailable:', error);
    }

    const moments = listMoments();
    const latest = moments.length ? presentMoment(moments[0]) : this.data.lastMoment;
    this.setData({
      instantMemoryEnabled,
      recentCount: moments.length,
      hasLastMoment: moments.length > 0,
      lastMoment: latest,
      locationName: input && input.locationName ? input.locationName : '',
      localDebug: Boolean(input && (input.localDebug === true || input.localDebug === 'true')),
      localDebugPhotoEndpoint: input && input.localDebugPhotoEndpoint ? input.localDebugPhotoEndpoint : ''
    });

    this.pendingInitialAction = input && input.initialAction ? input.initialAction : '';
    this.pendingInitialQuery = input && input.initialQuery ? input.initialQuery : '';
    this.pendingInitialUtterance = input && input.initialUtterance ? input.initialUtterance : '';
  },

  onShow() {
    this.pageVisible = true;
    if (this.pendingInitialUtterance) {
      const utterance = this.pendingInitialUtterance;
      this.pendingInitialUtterance = '';
      this.routeRecognizedText('intent', utterance);
      return;
    }
    if (this.pendingInitialQuery) {
      const query = this.pendingInitialQuery;
      this.pendingInitialQuery = '';
      this.performSearch(query);
      return;
    }
    if (this.pendingInitialAction === 'record') {
      this.pendingInitialAction = '';
      this.startQuickRecord();
      return;
    }
    if (this.pendingInitialAction === 'search') {
      this.pendingInitialAction = '';
      this.beginIntentListening('请直接问我过去发生的事');
      return;
    }
    if (this.data.phase === 'listening' && this.listeningRequested && !this.recognitionActive) {
      this.startRecognition();
      return;
    }
    if (this.resumePendingActionListening()) return;
    if (!this.isBusy()) {
      if (this.data.instantMemoryEnabled) this.startQuickRecord();
      else this.beginIntentListening();
    }
  },

  onHide() {
    this.pageVisible = false;
    if (this.data.phase === 'recording-audio') {
      this.interactionSessionId += 1;
      this.pendingAction = null;
      this.pendingAudio = null;
      this.stopActiveAudioRecorder();
      this.discardStagedMedia();
      this.setData({
        phase: 'idle',
        statusTitle: '录音已停止',
        statusDetail: '离开页面后不会继续录音或保存',
        sttLabel: '待命'
      });
    }
    this.suspendRecognition();
  },

  onUnload() {
    this.pageVisible = false;
    this.listeningRequested = false;
    this.stopActiveAudioRecorder();
    this.disposeRecognition();
  },

  isBusy() {
    return this.data.phase === 'capturing'
      || this.data.phase === 'listening'
      || this.data.phase === 'classifying'
      || this.data.phase === 'choosing-media'
      || this.data.phase === 'recording-audio'
      || this.data.phase === 'understanding'
      || this.data.phase === 'searching'
      || this.data.phase === 'updating'
      || this.data.phase === 'deleting';
  },

  beginIntentListening(title = '请直接说出你的意图', options = {}) {
    if (this.isBusy()) return;
    const preserveMedia = Boolean(options.preserveMedia);
    this.interactionSessionId += 1;
    if (!preserveMedia) {
      this.pendingPhoto = null;
      this.pendingAudio = null;
    }
    this.stopRequested = false;
    this.listeningRequested = true;
    this.recognitionFailed = false;
    this.recognizedText = '';
    this.setData({
      interactionMode: preserveMedia ? 'record' : 'intent',
      phase: 'listening',
      statusTitle: title,
      statusDetail: options.detail || '直接说发生了什么，也可以查询、修改、删除或配置',
      transcript: options.preserveTranscript ? this.data.transcript : '',
      photoCaptured: preserveMedia ? Boolean(this.pendingPhoto) : false,
      photoStatus: preserveMedia
        ? (this.pendingPhoto ? '预览中' : '未拍到')
        : (this.data.instantMemoryEnabled ? '待判断' : '未启用'),
      photoPreviewUrl: preserveMedia && this.pendingPhoto ? this.pendingPhoto.imageDataUrl : '',
      audioStatus: preserveMedia && this.pendingAudio ? '已录音' : '未录音',
      answer: '',
      answerLabel: '意图识别',
      evidenceCount: 0,
      errorMessage: '',
      sttLabel: '连接中'
    });
    this.startRecognition();
  },

  async startQuickRecord() {
    if (this.isBusy()) return;
    const sessionId = this.interactionSessionId + 1;
    this.interactionSessionId = sessionId;
    this.recordStartedAt = new Date().toISOString();
    this.pendingPhoto = null;
    this.pendingAudio = null;
    this.setData({
      interactionMode: 'record',
      phase: 'capturing',
      statusTitle: '正在拍下眼前这一刻',
      statusDetail: '拍摄完成后会显示预览，再询问想记录什么',
      transcript: '',
      photoCaptured: false,
      photoStatus: '拍摄中',
      photoPreviewUrl: '',
      audioStatus: '未录音',
      answer: '',
      evidenceCount: 0,
      errorMessage: '',
      sttLabel: '待命'
    });
    this.pendingPhoto = await this.capturePhoto(sessionId);
    if (sessionId !== this.interactionSessionId || !this.pageVisible) return;
    this.setData({ phase: 'idle' });
    this.beginIntentListening(
      this.pendingPhoto ? '照片已拍好，想记录什么？' : '没有拍到照片，想记录什么？',
      { preserveMedia: true }
    );
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
      if (sessionId === this.interactionSessionId) {
        this.setData({ photoCaptured: true, photoStatus: '预览中', photoPreviewUrl: imageDataUrl });
      }
      return {
        mimeType,
        imageDataUrl
      };
    } catch (error) {
      console.warn('Camera capture unavailable:', error);
      if (sessionId === this.interactionSessionId) {
        this.setData({ statusDetail: '摄像头暂不可用，将继续保存语音记忆', photoStatus: '未拍到' });
      }
      return null;
    }
  },

  async captureLocalDebugPhoto(sessionId) {
    try {
      const response = await fetch(this.data.localDebugPhotoEndpoint, { cache: 'no-store' });
      if (!response.ok) {
        if (sessionId === this.interactionSessionId) this.setData({ photoStatus: '未拍到' });
        return null;
      }
      const payload = JSON.parse(await response.text());
      if (!payload.base64) {
        if (sessionId === this.interactionSessionId) this.setData({ photoStatus: '未拍到' });
        return null;
      }
      const mimeType = payload.mimeType || 'image/jpeg';
      const imageDataUrl = `data:${mimeType};base64,${payload.base64}`;
      if (sessionId === this.interactionSessionId) {
        this.setData({ photoCaptured: true, photoStatus: '预览中', photoPreviewUrl: imageDataUrl });
      }
      return {
        mimeType,
        imageDataUrl
      };
    } catch (error) {
      console.warn('Local debug photo bridge unavailable:', error);
      if (sessionId === this.interactionSessionId) this.setData({ photoStatus: '未拍到' });
      return null;
    }
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
          this.routeRecognizedText('intent', text);
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

  async routeRecognizedText(mode, text) {
    const normalized = String(text || '').trim();
    if (!normalized) {
      this.finishWithoutSpeech();
      return;
    }

    if (await this.handlePendingAction(normalized)) return;
    if (this.processing) return;

    this.processing = true;
    this.listeningRequested = false;
    this.disposeRecognition();
    this.setData({
      interactionMode: 'intent',
      phase: 'classifying',
      statusTitle: '正在识别你的意图',
      statusDetail: '判断这是生活记录，还是查询、修改、删除或配置',
      transcript: normalized,
      answer: '',
      answerLabel: '意图识别',
      evidenceCount: 0,
      sttLabel: '已结束'
    });

    try {
      const plan = await runAgentTurn({
        utterance: normalized,
        forcedMode: mode === 'search' ? 'search' : ''
      });
      this.processing = false;
      this.dispatchIntent(plan.intent, normalized);
    } catch (error) {
      console.error('Unable to recognize intent:', error);
      this.processing = false;
      this.showUnknownIntent(normalized);
    }
  },

  dispatchIntent(intent, originalText) {
    if (intent.type !== 'moment.create') this.discardStagedMedia();
    switch (intent.type) {
      case 'moment.create': {
        const content = String(intent.content || '').trim();
        if (!content) {
          this.pendingAction = { type: 'create' };
          this.setData({ phase: 'idle' });
          this.beginIntentListening('想记录什么？');
          return;
        }
        this.prepareAndFinalizeRecord(content);
        return;
      }
      case 'moment.query':
        this.performSearch(intent.query || originalText, {
          mode: intent.mode || 'search',
          timeRange: intent.timeRange || 'unspecified',
          originalQuestion: originalText
        });
        return;
      case 'moment.update':
        this.performUpdate(intent, originalText);
        return;
      case 'moment.delete':
        this.requestDelete(intent.query || originalText);
        return;
      case 'moment.clear':
        this.requestClear();
        return;
      case 'config.set':
        if (intent.configKey === 'instant_memory' && typeof intent.configValue === 'boolean') {
          this.setInstantMemory(intent.configValue);
        } else {
          this.showUnsupportedConfig();
        }
        return;
      case 'config.get':
        this.showConfig(intent.configKey);
        return;
      case 'help':
        this.showHelp();
        return;
      default:
        this.showUnknownIntent(originalText);
    }
  },

  async handlePendingAction(text) {
    if (!this.pendingAction) return false;
    const pending = this.pendingAction;

    if (pending.type === 'create') {
      this.pendingAction = null;
      this.prepareAndFinalizeRecord(text);
      return true;
    }

    if (pending.type === 'record-media-choice') {
      const mediaChoice = resolveRecordMediaChoice(text);
      if (mediaChoice === 'cancel') {
        this.pendingAction = null;
        this.discardStagedMedia();
        this.setResult('已取消这次记录', '照片和描述都没有保存。', '记录结果');
        return true;
      }
      if (mediaChoice === 'retake') {
        await this.retakePendingPhoto(pending.content);
        return true;
      }
      if (mediaChoice === 'video' && !VIDEO_RECORDING_SUPPORTED) {
        this.setData({ phase: 'idle' });
        this.beginIntentListening('当前暂不支持视频录制', {
          preserveMedia: true,
          preserveTranscript: true,
          detail: '可以说“保存照片”“重新拍摄”“不保存照片”或“录一段音频”'
        });
        return true;
      }
      if (mediaChoice === 'photo+audio') {
        this.pendingAction = null;
        const sessionId = this.interactionSessionId;
        await this.recordAudioAttachment();
        if (sessionId !== this.interactionSessionId || !this.pageVisible) return true;
        this.finalizeRecord(pending.content);
        return true;
      }
      if (mediaChoice === 'audio') {
        this.pendingAction = null;
        this.pendingPhoto = null;
        this.setData({ photoCaptured: false, photoStatus: '不保存', photoPreviewUrl: '' });
        const sessionId = this.interactionSessionId;
        await this.recordAudioAttachment();
        if (sessionId !== this.interactionSessionId || !this.pageVisible) return true;
        this.finalizeRecord(pending.content);
        return true;
      }
      if (mediaChoice === 'text') {
        this.pendingAction = null;
        this.pendingPhoto = null;
        this.pendingAudio = null;
        this.setData({
          photoCaptured: false,
          photoStatus: '不保存',
          photoPreviewUrl: '',
          audioStatus: '未录音'
        });
        this.finalizeRecord(pending.content);
        return true;
      }
      if (mediaChoice === 'photo') {
        this.pendingAction = null;
        this.finalizeRecord(pending.content);
        return true;
      }

      this.setData({ phase: 'idle' });
      this.beginIntentListening('请选择这一刻的保存形式', {
        preserveMedia: true,
        preserveTranscript: true,
        detail: '说“保存照片”“重新拍摄”“不保存照片”或“录一段音频”'
      });
      return true;
    }

    if (/^(取消|不删除|不要删|算了|否|不是|不用)[。！!，,\s]*$/.test(text)) {
      this.pendingAction = null;
      this.setResult('操作已取消', '没有修改你的 Moment。', '操作结果');
      return true;
    }

    if (!/^(确认|确定|是|好的|可以|删除|确认删除|全部删除)[。！!，,\s]*$/.test(text)) {
      this.setResult('等待确认', '请说“确认删除”或“取消”。', '安全确认');
      return true;
    }

    this.pendingAction = null;
    this.discardStagedMedia();
    if (pending.type === 'delete') {
      const deleted = deleteMoment(pending.momentId);
      const message = deleted ? `已删除“${pending.title}”。` : '这条 Moment 已不存在。';
      this.refreshMomentSummary();
      this.setResult(deleted ? '记忆已删除' : '没有找到记录', message, '操作结果');
      this.speak(message);
      return true;
    }

    if (pending.type === 'clear') {
      const count = clearMoments();
      this.refreshMomentSummary();
      const message = count ? `已删除全部 ${count} 条 Moment。` : '当前没有可删除的 Moment。';
      this.setResult('记忆已清空', message, '操作结果');
      this.speak(message);
      return true;
    }

    return false;
  },

  discardStagedMedia() {
    this.pendingPhoto = null;
    this.pendingAudio = null;
    this.setData({
      photoCaptured: false,
      photoStatus: this.data.instantMemoryEnabled ? '待拍摄' : '未启用',
      photoPreviewUrl: '',
      audioStatus: '未录音'
    });
  },

  beginMediaChoiceListening(content) {
    this.setData({ phase: 'idle', transcript: content });
    this.beginIntentListening('这一刻使用哪种形式保存？', {
      preserveMedia: true,
      preserveTranscript: true,
      detail: '说“保存照片”“重新拍摄”“不保存照片”或“录一段音频”'
    });
  },

  requestRecordMediaChoice(content) {
    this.pendingAction = { type: 'record-media-choice', content };
    this.beginMediaChoiceListening(content);
  },

  resumePendingActionListening() {
    if (!this.pendingAction) return false;
    if (this.pendingAction.type === 'record-media-choice') {
      this.beginMediaChoiceListening(this.pendingAction.content);
      return true;
    }
    if (this.pendingAction.type === 'create') {
      this.beginIntentListening('想记录什么？', {
        detail: '直接说这一刻发生了什么'
      });
      return true;
    }
    this.beginIntentListening('请确认刚才的操作', {
      detail: '说“确认删除”或“取消”'
    });
    return true;
  },

  async retakePendingPhoto(content) {
    const sessionId = this.interactionSessionId + 1;
    this.interactionSessionId = sessionId;
    this.setData({
      interactionMode: 'record',
      phase: 'capturing',
      statusTitle: '正在重新拍摄',
      statusDetail: '拍摄完成后会显示新的预览',
      photoCaptured: false,
      photoStatus: '拍摄中',
      photoPreviewUrl: '',
      sttLabel: '待命'
    });
    this.pendingPhoto = await this.capturePhoto(sessionId);
    if (sessionId !== this.interactionSessionId || !this.pageVisible) return;
    this.pendingAction = { type: 'record-media-choice', content };
    this.beginMediaChoiceListening(content);
  },

  async recordAudioAttachment() {
    this.pendingAudio = null;
    this.setData({
      interactionMode: 'record',
      phase: 'recording-audio',
      statusTitle: '正在录音',
      statusDetail: '将录制约 8 秒，完成后自动保存这一刻',
      audioStatus: '录音中',
      sttLabel: '待命'
    });

    if (this.data.localDebug) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      const audio = {
        type: 'audio',
        localFilePath: `local-debug://moment-audio-${Date.now()}.wav`
      };
      this.pendingAudio = audio;
      this.setData({ audioStatus: '已录音' });
      return audio;
    }

    try {
      const manager = wx.media.getRecorderManager();
      if (!manager) throw new Error('录音能力不可用');
      this.audioRecorder = manager;
      const audio = await new Promise(async (resolve) => {
        let finished = false;
        const finish = (value) => {
          if (finished) return;
          finished = true;
          resolve(value);
        };
        manager.onStop((result) => finish(result && result.tempFilePath
          ? { type: 'audio', localFilePath: result.tempFilePath }
          : null));
        manager.onError((event) => {
          console.warn('Audio recording error:', event && event.errMsg);
          finish(null);
        });
        await manager.start({});
        setTimeout(async () => {
          try {
            await manager.stop();
            setTimeout(() => finish(null), 1000);
          } catch (error) {
            console.warn('Unable to stop audio recording:', error);
            finish(null);
          }
        }, AUDIO_RECORDING_DURATION_MS);
      });
      this.pendingAudio = audio;
      this.setData({ audioStatus: audio ? '已录音' : '录音失败' });
      return audio;
    } catch (error) {
      console.warn('Audio recording unavailable:', error);
      this.setData({
        audioStatus: '录音失败',
        statusDetail: '录音能力暂不可用，将保存文字描述'
      });
      return null;
    } finally {
      this.audioRecorder = null;
    }
  },

  stopActiveAudioRecorder() {
    const recorder = this.audioRecorder;
    this.audioRecorder = null;
    if (!recorder) return;
    try {
      Promise.resolve(recorder.stop()).catch((error) => {
        console.warn('Unable to stop active audio recording:', error);
      });
    } catch (error) {
      console.warn('Unable to stop active audio recording:', error);
    }
  },

  setResult(title, message, label = '操作结果', evidenceCount = 0) {
    this.setData({
      phase: 'answered',
      statusTitle: title,
      statusDetail: message,
      answer: message,
      answerLabel: label,
      evidenceCount,
      sttLabel: '待命',
      errorMessage: ''
    });
  },

  showUnknownIntent(text) {
    this.setData({
      interactionMode: 'intent',
      phase: 'idle',
      statusTitle: '还不能确定你的意图',
      statusDetail: '可以说刚发生的具体事情，或直接问过去的记忆',
      transcript: text,
      answer: '这句话还不像一条具体生活记录，我没有保存。你可以直接说“今天第一次带妈妈看海”，不需要先说“记录”。',
      answerLabel: '未执行',
      evidenceCount: 0,
      sttLabel: '待命'
    });
  },

  showHelp() {
    this.setResult(
      '可以直接说完整指令',
      '支持记录新 Moment、查询和回顾、修改或删除已有 Moment，以及开启或关闭即刻记忆。',
      '能力说明'
    );
  },

  showConfig(configKey) {
    const message = configKey === 'instant_memory'
      ? `即刻记忆当前已${this.data.instantMemoryEnabled ? '开启' : '关闭'}。`
      : `当前有 ${this.data.recentCount} 条 Moment；即刻记忆已${this.data.instantMemoryEnabled ? '开启' : '关闭'}。`;
    this.setResult('当前功能配置', message, '配置状态');
    this.speak(message);
  },

  showUnsupportedConfig() {
    this.setResult('暂不支持这项配置', '目前可配置“即刻记忆”，例如说“关闭即刻记忆”。', '配置结果');
  },

  findTargetMoments(query, limit = 3) {
    const all = listMoments();
    const rawTarget = String(query || '').trim();
    const target = rawTarget
      .replace(/^(这条|那条|关于|有关)/, '')
      .replace(/(这条|那条)?(记忆|记录|Moment)$/i, '')
      .trim();
    if (/^(这条|那条|刚才|刚刚|上一条|最近一条|最新一条)(记录|记忆|Moment)?$/i.test(rawTarget)) {
      return all.slice(0, 1);
    }
    if (!target) return [];
    return searchMoments(target, limit);
  },

  requestDelete(query) {
    const candidates = this.findTargetMoments(query);
    if (!candidates.length) {
      this.setResult('没有找到要删除的记忆', '请用标题、时间、地点或事件描述要删除的 Moment。', '删除结果');
      return;
    }
    if (candidates.length > 1) {
      const titles = candidates.map((moment) => moment.title).join('、');
      this.setResult('找到多条可能的记忆', `请说得更具体一些：${titles}。`, '需要定位', candidates.length);
      return;
    }

    const moment = candidates[0];
    this.pendingAction = { type: 'delete', momentId: moment.id, title: moment.title };
    this.setResult('确认删除这条记忆？', `将删除“${moment.title}”。请再次唤醒并说“确认删除”或“取消”。`, '安全确认', 1);
    this.speak(`确认删除${moment.title}吗？`);
  },

  requestClear() {
    const count = listMoments().length;
    if (!count) {
      this.setResult('当前没有记忆', '没有需要删除的 Moment。', '删除结果');
      return;
    }
    this.pendingAction = { type: 'clear' };
    this.setResult('确认清空全部记忆？', `这会删除全部 ${count} 条 Moment。请再次唤醒并说“全部删除”或“取消”。`, '安全确认', count);
    this.speak(`确认删除全部${count}条记忆吗？`);
  },

  async performUpdate(intent, originalText) {
    const candidates = this.findTargetMoments(intent.query);
    const changes = intent.changes && typeof intent.changes === 'object' ? intent.changes : {};
    if (!candidates.length) {
      this.setResult('没有找到要修改的记忆', '请说明要修改哪一条，例如“把上一条的地点改成西湖”。', '修改结果');
      return;
    }
    if (candidates.length > 1) {
      const titles = candidates.map((moment) => moment.title).join('、');
      this.setResult('找到多条可能的记忆', `请进一步说明要修改哪一条：${titles}。`, '需要定位', candidates.length);
      return;
    }
    if (!Object.keys(changes).length) {
      this.setResult('没有识别到修改内容', `我找到了“${candidates[0].title}”，但还不知道要改什么。`, '修改结果', 1);
      return;
    }

    this.processing = true;
    this.setData({
      interactionMode: 'update',
      phase: 'updating',
      statusTitle: '正在修改这条记忆',
      statusDetail: '只更新你明确指定的内容',
      transcript: originalText,
      answer: '',
      answerLabel: '修改结果',
      evidenceCount: 1
    });

    try {
      const original = candidates[0];
      let patch = {};
      if (changes.replacementText) {
        const image = Array.isArray(original.media)
          ? original.media.find((item) => item.type === 'image' && item.localDataUrl)
          : null;
        const analysis = await analyzeMoment({
          voiceInput: changes.replacementText,
          timestamp: original.occurredAt,
          location: original.location,
          hasImage: Boolean(image),
          imageDataUrl: image && image.localDataUrl
        });
        patch = {
          voiceInput: changes.replacementText,
          title: analysis.title,
          description: analysis.description,
          category: analysis.category,
          tags: analysis.tags,
          emotion: analysis.emotion,
          aiSummary: analysis.aiSummary,
          confidence: analysis.confidence
        };
      }
      ['title', 'description', 'aiSummary', 'category'].forEach((key) => {
        if (changes[key]) patch[key] = changes[key];
      });
      if (Array.isArray(changes.tags) && changes.tags.length) patch.tags = changes.tags;
      if (changes.locationName) {
        patch.location = { ...(original.location || {}), name: changes.locationName, source: 'user' };
      }
      if (changes.occurredAt && !Number.isNaN(Date.parse(changes.occurredAt))) {
        patch.occurredAt = new Date(changes.occurredAt).toISOString();
      }

      const updated = updateMoment(original.id, patch);
      this.processing = false;
      if (!updated) {
        this.setResult('修改失败', '这条 Moment 已不存在。', '修改结果');
        return;
      }
      this.refreshMomentSummary();
      const message = `已更新“${updated.title}”。`;
      this.setResult('记忆已修改', message, '修改结果', 1);
      this.speak(message);
    } catch (error) {
      console.error('Unable to update Moment:', error);
      this.processing = false;
      this.setResult('暂时无法修改', '请稍后再试一次。', '修改结果');
    }
  },

  refreshMomentSummary() {
    const moments = listMoments();
    const latest = moments.length ? presentMoment(moments[0]) : {
      categoryMark: '', title: '', aiSummary: '', tagsText: ''
    };
    this.setData({
      recentCount: moments.length,
      hasLastMoment: moments.length > 0,
      lastMoment: latest
    });
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
    if (this.data.interactionMode === 'record') this.finalizeRecord(this.recognizedText || '');
    else if (this.recognizedText) this.performSearch(this.recognizedText);
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
    this.pendingPhoto = null;
    this.pendingAudio = null;
    this.pendingAction = null;
    this.stopActiveAudioRecorder();
    this.disposeRecognition();
    this.setData({
      phase: 'idle',
      statusTitle: '已取消',
      statusDetail: '再次唤醒后直接说出意图',
      transcript: '',
      photoCaptured: false,
      photoStatus: '待命',
      photoPreviewUrl: '',
      audioStatus: '未录音',
      sttLabel: '待命',
      errorMessage: ''
    });
  },

  createId() {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
    return `moment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  },

  async prepareAndFinalizeRecord(voiceInput) {
    if (this.processing) return;
    this.recordStartedAt = this.recordStartedAt || new Date().toISOString();
    this.pendingAudio = null;

    if (this.data.instantMemoryEnabled && this.pendingPhoto) {
      this.requestRecordMediaChoice(voiceInput);
      return;
    }

    if (!this.data.instantMemoryEnabled) {
      this.finalizeRecord(voiceInput);
      return;
    }

    const sessionId = this.interactionSessionId + 1;
    this.interactionSessionId = sessionId;
    this.setData({
      interactionMode: 'record',
      phase: 'capturing',
      statusTitle: '正在补拍这一刻',
      statusDetail: '拍摄完成后请确认保存形式',
      transcript: voiceInput,
      photoCaptured: false,
      photoStatus: '拍摄中',
      photoPreviewUrl: '',
      audioStatus: '未录音',
      answer: '',
      evidenceCount: 0,
      errorMessage: '',
      sttLabel: '已结束'
    });

    this.pendingPhoto = await this.capturePhoto(sessionId);
    if (sessionId !== this.interactionSessionId || !this.pageVisible) return;
    this.requestRecordMediaChoice(voiceInput);
  },

  async finalizeRecord(voiceInput) {
    if (this.processing) return;
    this.processing = true;
    this.listeningRequested = false;
    this.disposeRecognition();
    this.setData({
      phase: 'understanding',
      statusTitle: '正在整理这一刻',
      statusDetail: '生成摘要、分类和标签',
      sttLabel: '已结束'
    });

    try {
      const photo = this.pendingPhoto;
      const audio = this.pendingAudio;
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
        revision: 0,
        syncState: 'pending',
        media: [
          ...(photo ? [{
            id: this.createId(),
            type: 'image',
            mimeType: photo.mimeType,
            localDataUrl: photo.imageDataUrl
          }] : []),
          ...(audio ? [{
            id: this.createId(),
            type: 'audio',
            localFilePath: audio.localFilePath
          }] : [])
        ],
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
          promptVersion: MOMENT_PROMPT_VERSION,
          instantMemory: this.data.instantMemoryEnabled,
          mediaChoice: audio ? (photo ? 'photo+audio' : 'audio') : (photo ? 'photo' : 'text')
        },
        createdAt: now,
        updatedAt: now
      };

      saveMoment(moment);
      const mediaStatus = audio
        ? (photo ? '照片与录音已保存' : '录音已保存')
        : (photo ? '照片已保存' : '文字已保存');
      this.pendingPhoto = null;
      this.pendingAudio = null;
      this.processing = false;
      this.setData({
        phase: 'saved',
        statusTitle: '这一刻，已记住',
        statusDetail: `${analysis.aiMode === 'fallback' ? '离线理解' : '摘要与标签'} · ${mediaStatus}`,
        transcript: voiceInput || '',
        lastMoment: presentMoment(moment),
        hasLastMoment: true,
        recentCount: listMoments().length,
        answer: '',
        answerLabel: '记录结果',
        evidenceCount: 0,
        photoCaptured: false,
        photoStatus: this.data.instantMemoryEnabled ? '待拍摄' : '未启用',
        photoPreviewUrl: '',
        audioStatus: '未录音',
        sttLabel: '待命'
      });
      this.speak('这一刻，已经记住了');
    } catch (error) {
      console.error('Unable to save Moment:', error);
      this.processing = false;
      this.setData({
        phase: 'error',
        statusTitle: '暂时没有保存成功',
        statusDetail: '可以再次记录',
        sttLabel: '待命',
        errorMessage: String(error && error.message ? error.message : error)
      });
    }
  },

  selectEvidence(question, requestedTimeRange = 'unspecified', limit = 6) {
    const all = listMoments();
    const rangeMarkers = {
      today: '今天',
      yesterday: '昨天',
      this_week: '本周',
      last_week: '上周',
      recent: '最近',
      all: '所有记录'
    };
    const scopedQuestion = requestedTimeRange && requestedTimeRange !== 'unspecified'
      ? `${question} ${rangeMarkers[requestedTimeRange] || ''}`.trim()
      : question;
    if (requestedTimeRange === 'all') return all.slice(0, limit);
    const timezoneOffset = 8 * 60 * 60 * 1000;
    const now = new Date(Date.now() + timezoneOffset);
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - timezoneOffset;
    let rangeStart = null;
    let rangeEnd = null;

    if (/今天/.test(scopedQuestion)) {
      rangeStart = todayStart;
      rangeEnd = todayStart + 24 * 60 * 60 * 1000;
    } else if (/昨天/.test(scopedQuestion)) {
      rangeStart = todayStart - 24 * 60 * 60 * 1000;
      rangeEnd = todayStart;
    } else if (/上周/.test(scopedQuestion)) {
      const day = now.getUTCDay() || 7;
      const thisWeekStart = todayStart - (day - 1) * 24 * 60 * 60 * 1000;
      rangeStart = thisWeekStart - 7 * 24 * 60 * 60 * 1000;
      rangeEnd = thisWeekStart;
    } else if (/本周|这周/.test(scopedQuestion)) {
      const day = now.getUTCDay() || 7;
      rangeStart = todayStart - (day - 1) * 24 * 60 * 60 * 1000;
      rangeEnd = todayStart + 24 * 60 * 60 * 1000;
    }

    if (rangeStart !== null) {
      return all.filter((moment) => {
        const timestamp = Date.parse(moment.occurredAt || moment.createdAt || '');
        return !Number.isNaN(timestamp) && timestamp >= rangeStart && timestamp < rangeEnd;
      }).slice(0, limit);
    }
    if (/多少条|有哪些记录|所有记录|全部记录|我都有哪些|回顾|总结|最近|这几天/.test(scopedQuestion)) {
      return all.slice(0, limit);
    }
    return searchMoments(question, limit);
  },

  async performSearch(question, options = {}) {
    if (!String(question || '').trim() || this.processing) return;
    const originalQuestion = String(options.originalQuestion || question).trim();
    const mode = options.mode || 'search';
    const timeRange = options.timeRange || 'unspecified';
    this.processing = true;
    this.listeningRequested = false;
    this.pendingPhoto = null;
    this.disposeRecognition();
    this.setData({
      interactionMode: 'search',
      phase: 'searching',
      statusTitle: '正在翻找你的记忆',
      statusDetail: '只依据你保存过的 Moment 回答',
      transcript: originalQuestion,
      answer: '',
      answerLabel: '记忆查询',
      evidenceCount: 0,
      photoCaptured: false,
      photoStatus: '未启用',
      sttLabel: '已结束'
    });

    try {
      if (mode === 'count' || /多少条|一共.*记录|记录.*数量/.test(originalQuestion)) {
        const count = timeRange === 'unspecified'
          ? listMoments().length
          : this.selectEvidence(originalQuestion, timeRange, 120).length;
        const answer = `你目前有 ${count} 条 Moment。`;
        this.processing = false;
        this.setData({
          phase: 'answered',
          statusTitle: '已统计你的记忆',
          statusDetail: '结果来自本地 Moment',
          answer,
          answerLabel: '记忆统计',
          evidenceCount: count,
          sttLabel: '待命'
        });
        this.speak(answer);
        return;
      }
      const evidence = this.selectEvidence(originalQuestion, timeRange);
      const answer = await answerMemoryQuestion(originalQuestion, evidence);
      this.processing = false;
      this.setData({
        phase: 'answered',
        statusTitle: evidence.length ? `找到 ${evidence.length} 条相关记忆` : '没有找到相关记忆',
        statusDetail: '回答来自你自己的 Moment',
        answer,
        answerLabel: `依据 ${evidence.length} 条 Moment`,
        evidenceCount: evidence.length,
        sttLabel: '待命'
      });
      this.speak(answer);
    } catch (error) {
      console.error('Unable to search memory:', error);
      this.processing = false;
      this.setData({
        phase: 'error',
        statusTitle: '暂时无法查询',
        statusDetail: '请稍后再问一次',
        sttLabel: '待命',
        errorMessage: String(error && error.message ? error.message : error)
      });
    }
  },

  speak(text) {
    try {
      wx.speech.playTTS(String(text || '').slice(0, 160));
    } catch (error) {
      console.warn('TTS unavailable:', error);
    }
  },

  setInstantMemory(enabled) {
    if (this.isBusy()) this.cancelInteraction();
    try {
      wx.setStorageSync(INSTANT_MEMORY_KEY, Boolean(enabled));
    } catch (error) {
      console.warn('Unable to save instant memory preference:', error);
    }

    this.setData({
      instantMemoryEnabled: Boolean(enabled),
      phase: 'idle',
      statusTitle: enabled ? '快速记录已开启' : '快速记录已关闭',
      statusDetail: enabled ? '进入记录时会先拍照并显示预览' : '记录时不会自动拍照',
      transcript: '',
      photoCaptured: false,
      photoStatus: enabled ? '待拍摄' : '未启用',
      photoPreviewUrl: '',
      audioStatus: '未录音',
      answer: '',
      answerLabel: '配置结果',
      evidenceCount: 0,
      sttLabel: '待命'
    });
    this.speak(enabled ? '快速记录已开启' : '快速记录已关闭');
  },

  onVoiceWakeup(event) {
    const utterance = String((event && event.keyword) || '').trim();
    const containsIntent = /记录|记下|记住|保存|新增|添加|问|找|查|回顾|总结|修改|更正|纠正|更新|删除|清空|确认|取消|配置|设置|即刻记忆|快速记录|重新拍|重拍|录音|视频|不保存照片/.test(utterance);
    if (utterance && utterance !== '一刻' && containsIntent) {
      if (this.isBusy()) this.cancelInteraction();
      this.routeRecognizedText('intent', utterance);
      return;
    }
    if (!this.isBusy()) {
      if (this.resumePendingActionListening()) {
        return;
      } else if (this.data.instantMemoryEnabled) {
        this.startQuickRecord();
      } else {
        this.beginIntentListening();
      }
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

    if (control === CONTROL.BACK) {
      if (this.isBusy()) {
        event.preventDefault();
        if (this.data.phase === 'classifying' || this.data.phase === 'understanding' || this.data.phase === 'searching' || this.data.phase === 'updating' || this.data.phase === 'deleting') {
          this.setData({ statusDetail: '正在处理，请稍候' });
        } else {
          this.cancelInteraction();
        }
      }
      return;
    }

    event.preventDefault();
    if (control === CONTROL.ACTIVATE) {
      if (!this.isBusy()) {
        if (this.resumePendingActionListening()) {
          return;
        } else if (this.data.instantMemoryEnabled) {
          this.startQuickRecord();
        } else {
          this.beginIntentListening();
        }
      }
      return;
    }
  }
}
</script>

<page>
  <view class="app-shell">
    <view class="top-row">
      <view class="brand-block">
        <text class="brand-title">一刻</text>
        <text class="brand-subtitle">无需选择功能，直接说</text>
      </view>
      <view class="mode-pill">
        <text>{{ phase === 'capturing' ? '拍摄中' : phase === 'recording-audio' ? '录音中' : phase === 'listening' ? '语音 ' + sttLabel : phase === 'classifying' || phase === 'understanding' || phase === 'searching' || phase === 'updating' || phase === 'deleting' ? '处理中' : recentCount + ' 条记忆' }}</text>
      </view>
    </view>

    <card class="memory-card" role="group">
      <view class="status-row">
        <view class="voice-orb {{ phase === 'capturing' || phase === 'recording-audio' || phase === 'listening' || phase === 'classifying' || phase === 'understanding' || phase === 'searching' || phase === 'updating' || phase === 'deleting' ? 'voice-orb-active' : '' }}">
          <text class="orb-label">{{ phase === 'capturing' ? '看' : phase === 'recording-audio' ? '录' : phase === 'listening' ? '听' : phase === 'classifying' || phase === 'understanding' || phase === 'searching' || phase === 'updating' || phase === 'deleting' ? '想' : phase === 'saved' ? '存' : phase === 'answered' ? '答' : '说' }}</text>
        </view>
        <view class="status-copy">
          <text class="status-title">{{ statusTitle }}</text>
          <text class="status-detail">{{ statusDetail }}</text>
        </view>
      </view>

      <scroll-view class="content-scroll" scroll-y="true">
        <view class="photo-preview-panel" ink:if="{{ photoPreviewUrl }}">
          <image class="photo-preview" src="{{ photoPreviewUrl }}" mode="aspectFit"></image>
          <view class="preview-copy">
            <text class="preview-title">照片预览</text>
            <text class="preview-meta">{{ photoStatus }} · {{ audioStatus }}</text>
          </view>
        </view>

        <view ink:if="{{ interactionMode === 'record' }}">
          <view class="capture-line" ink:if="{{ phase === 'capturing' || phase === 'understanding' }}">
            <text>快速记录 {{ instantMemoryEnabled ? '开' : '关' }}</text>
            <text class="dot">·</text>
            <text>画面 {{ photoStatus }}</text>
            <text class="dot">·</text>
            <text>位置 {{ locationName ? locationName : '未提供' }}</text>
          </view>
        </view>

        <text class="transcript" ink:if="{{ transcript }}">“{{ transcript }}”</text>

        <view class="answer-block" ink:if="{{ answer }}">
          <text class="answer-label">{{ answerLabel }}</text>
          <text class="answer-text">{{ answer }}</text>
        </view>

        <view ink:if="{{ hasLastMoment }}">
          <view class="moment-preview" ink:if="{{ answer ? false : phase === 'idle' || phase === 'saved' || phase === 'answered' || phase === 'error' }}">
            <view class="category-mark"><text>{{ lastMoment.categoryMark }}</text></view>
            <view class="moment-copy">
              <text class="moment-title">{{ lastMoment.title }}</text>
              <text class="moment-summary">{{ lastMoment.aiSummary }}</text>
              <text class="moment-tags">{{ lastMoment.tagsText }}</text>
            </view>
          </view>
        </view>

        <text class="error-text" ink:if="{{ errorMessage }}">{{ errorMessage }}</text>
      </scroll-view>
    </card>

    <view class="intent-guide">
      <text class="guide-title">一句话即可</text>
      <text class="guide-example">“今天第一次带妈妈看海” · “我上周去过哪里”</text>
      <text class="guide-example">“修改上一条地点” · “删除那条面馆记录”</text>
      <text class="guide-meta">快速记录开启时：先拍照预览，再对话确认保存形式</text>
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

.top-row {
  width: 100%;
  height: 42px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.brand-block {
  display: flex;
  flex-direction: column;
}

.brand-title {
  color: var(--color-primary);
  font-size: 19px;
  line-height: 22px;
  font-weight: 700;
}

.brand-subtitle, .status-detail, .capture-line, .moment-summary, .moment-tags, .answer-label, .error-text {
  color: var(--color-text-secondary);
}

.brand-subtitle, .mode-pill, .capture-line, .answer-label, .moment-tags, .error-text {
  font-size: 11px;
  line-height: 15px;
}

.mode-pill {
  padding: 4px 8px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
}

.memory-card {
  width: 100%;
  height: 202px;
  box-sizing: border-box;
  padding: var(--card-padding);
  border: var(--card-border-width) solid var(--card-border-color);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.status-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-md);
}

.voice-orb {
  width: 50px;
  height: 50px;
  flex-shrink: 0;
  border: var(--border-width-default) solid var(--border-color-muted);
  border-radius: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 0 var(--border-width-thin) var(--color-primary-40);
}

.voice-orb-active {
  border-color: var(--border-color-accent);
  box-shadow: 0 0 12px var(--color-primary-60);
}

.orb-label {
  color: var(--color-primary);
  font-size: 17px;
  font-weight: 700;
}

.status-copy, .moment-copy, .answer-block {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.status-title {
  font-size: 18px;
  line-height: 22px;
  font-weight: 700;
}

.status-detail, .answer-text {
  font-size: 12px;
  line-height: 17px;
}

.capture-line {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
}

.photo-preview-panel {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 7px;
  padding: 5px;
  border: var(--border-width-thin) solid var(--border-color-accent);
  border-radius: var(--radius-sm);
}

.photo-preview {
  width: 82px;
  height: 54px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background-color: var(--color-background);
}

.preview-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.preview-title {
  color: var(--color-primary);
  font-size: 11px;
  line-height: 15px;
  font-weight: 700;
}

.preview-meta {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.dot {
  color: var(--color-primary);
}

.transcript {
  color: var(--color-primary);
  font-size: 12px;
  line-height: 16px;
}

.content-scroll {
  width: 100%;
  height: 106px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.answer-block {
  padding: 6px;
  border: var(--border-width-thin) solid var(--border-color-accent);
  border-radius: var(--radius-sm);
}

.answer-text {
  color: var(--color-text-primary);
}

.moment-preview {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 6px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
}

.category-mark {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: 16px;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
}

.moment-title {
  font-size: 13px;
  line-height: 17px;
  font-weight: 700;
}

.moment-summary {
  font-size: 11px;
  line-height: 15px;
}

.intent-guide {
  width: 100%;
  height: 60px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 1px;
}

.guide-title {
  color: var(--color-primary);
  font-size: 11px;
  line-height: 14px;
  font-weight: 700;
}

.guide-example, .guide-meta {
  font-size: 10px;
  line-height: 13px;
}

.guide-example {
  color: var(--color-text-primary);
}

.guide-meta {
  color: var(--color-text-secondary);
}
</style>
