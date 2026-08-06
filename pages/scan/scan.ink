<script def>
{
  "navigationBarTitleText": "绑定账号",
  "description": "Guides a Rokid Glasses user through QR account binding, showing camera, validation, network, success, and recoverable error states.",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "status": { "type": "string", "description": "Primary binding status shown to the user" },
        "hint": { "type": "string", "description": "Hardware-key or recovery guidance" },
        "modeLabel": { "type": "string" },
        "phase": { "type": "string", "enum": ["initializing", "ready", "capturing", "binding", "success", "error", "listening"] }
      },
      "required": ["status", "hint", "modeLabel", "phase"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import BarcodeDetector from 'barcode';
import { SpeechRecognition } from 'speech';
import { CONTROL, resolveControl } from '../../services/controls.js';
import { requestBinding } from '../../services/binding.js';
import { decodeCameraImage } from '../../services/image-decode.js';
import { decodeWebP } from '../../services/webp.js';
import { decodeQrPixels } from '../../services/qr-fallback.js';
import {
  extractSpokenBindingCode,
  findBindingCode
} from '../../services/qr-scanner.js';

const ERROR_HINTS = {
  BINDING_CODE_EXPIRED: '二维码已过期，请在 Web 端刷新后重试',
  BINDING_CODE_USED: '二维码已使用，请在 Web 端重新生成',
  BINDING_CODE_INVALID: '这不是有效的一刻绑定二维码',
  INVALID_BINDING_CODE: '这不是有效的一刻绑定二维码',
  DEVICE_ALREADY_BOUND: '当前眼镜已绑定其他账号，请先解绑后重试',
  INVALID_REQUEST: '绑定请求无效，请重新生成二维码',
  RATE_LIMITED: '请求过于频繁，请稍后再试',
  REQUEST_TIMEOUT: '连接超时，请检查网络后重试',
  NETWORK_ERROR: '网络不可用，请检查连接后重试',
  SERVER_ERROR: '绑定服务暂时不可用，请稍后重试',
  INVALID_TOKEN_RESPONSE: '绑定响应不完整，请稍后重试',
  DEVICE_ID_ERROR: '无法创建设备标识，请重新打开应用',
  STORAGE_ERROR: '无法保存绑定信息，请检查设备存储',
  UNKNOWN: '绑定失败，请重新扫码'
};

export default {
  data: {
    status: '正在检查扫码能力',
    hint: '请稍候',
    modeLabel: '扫码绑定',
    phase: 'initializing'
  },

  async onLoad() {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.pageActive = true;
    this.binding = false;
    this.currentMode = 'scan';
    this.capturing = false;
    this.camera = null;
    this.detector = null;
    this.scannerState = 'initializing';
    this.recognition = null;
    this.recognitionActive = false;
    this.backPressCount = 0;
    this.backPressTimer = null;
  },

  async onReady() {
    await this.initializeScanner();
  },

  async onShow() {
    this.pageActive = true;
    await this.initializeScanner();
  },

  onHide() {
    // 官方 scanner sample 在页面隐藏时释放 CameraContext。正在进行的
    // takePhoto 已持有本次调用所需的上下文，不在这里中止扫码状态。
    this.camera = null;
    if (!this.capturing && !this.binding) this.scannerState = 'initializing';
  },

  onUnload() {
    this.pageActive = false;
    this.binding = false;
    this.capturing = false;
    this.camera = null;
    this.detector = null;
    if (this.backPressTimer) clearTimeout(this.backPressTimer);
    this.backPressTimer = null;
    this.stopRecognition();
  },

  async initializeScanner() {
    if (this.scannerInitializing || this.capturing || this.binding) return;
    if (this.scannerState === 'ready' && this.camera && this.detector) return;
    this.scannerInitializing = true;
    this.scannerState = 'initializing';
    this.setData({
      status: '正在连接相机预览',
      hint: '请稍候',
      modeLabel: '扫码绑定',
      phase: 'initializing'
    });

    try {
      // 官方 scanner sample 使用页面中的 <camera> 组件配合
      // wx.media.createCameraContext()，并直接使用 BarcodeDetector。
      this.camera = wx.media && typeof wx.media.createCameraContext === 'function'
        ? wx.media.createCameraContext()
        : typeof wx.createCameraContext === 'function'
          ? wx.createCameraContext()
          : null;
      this.detector = new BarcodeDetector();
      console.info('[moment-one:binding-scan] official scanner capability ready', {
        hasCameraContext: Boolean(this.camera),
        hasBarcodeDetector: Boolean(this.detector)
      });
    } catch (error) {
      this.camera = null;
      this.detector = null;
      console.warn('[moment-one:binding-scan] official scanner initialization failed', {
        name: error && error.name,
        message: error && error.message
      });
    } finally {
      this.scannerInitializing = false;
    }

    if (!this.camera || !this.detector) {
      this.scannerState = 'unsupported';
      this.switchToVoiceMode('当前环境无法使用相机扫码');
      return;
    }

    this.scannerState = 'ready';
    this.switchToScanMode();
  },

  async onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;

    if (this.scannerState === 'initializing') {
      event.preventDefault();
      this.setData({
        status: '正在连接相机预览',
        hint: '请稍候，暂不要重复按确认键',
        phase: 'initializing'
      });
      return;
    }

    if (control === CONTROL.BACK) {
      event.preventDefault();
      this.handleBack();
      return;
    }

    if (control === CONTROL.ACTIVATE) {
      event.preventDefault();
      if (this.currentMode === 'scan') await this.captureAndDetect();
      else if (this.currentMode === 'voice') this.startVoiceBinding();
      return;
    }

    if (control === CONTROL.NEXT) {
      event.preventDefault();
      if (this.binding || this.capturing) return;
      if (this.currentMode === 'scan') this.switchToVoiceMode();
      else if (this.currentMode === 'voice' && this.camera) this.switchToScanMode();
    }
  },

  handleBack() {
    if (this.binding || this.capturing) {
      this.setData({ hint: '当前操作完成后可返回' });
      return;
    }

    this.backPressCount += 1;
    if (this.backPressCount >= 2) {
      if (this.backPressTimer) clearTimeout(this.backPressTimer);
      this.backPressTimer = null;
      this.backPressCount = 0;
      this.enterLocalMode();
      return;
    }

    this.setData({
      status: '再次按返回键可跳过绑定',
      hint: '不操作将返回入口',
      phase: 'ready'
    });
    this.backPressTimer = setTimeout(() => {
      this.backPressTimer = null;
      this.backPressCount = 0;
      if (this.pageActive) wx.redirectTo({ url: '/pages/index/index?fromBinding=true' });
    }, 1500);
  },

  switchToVoiceMode(reason = '') {
    this.currentMode = 'voice';
    this.stopRecognition();
    this.setData({
      status: reason || '语音输入绑定码',
      hint: '按确认键读出绑定码；按下一键返回扫码',
      modeLabel: '语音备用',
      phase: reason ? 'error' : 'ready'
    });
  },

  switchToScanMode() {
    this.currentMode = 'scan';
    this.stopRecognition();
    this.setData({
      status: '将绑定二维码对准相机',
      hint: '按确认键拍照识别；按下一键切换语音',
        modeLabel: '扫码绑定',
      phase: 'ready'
    });
  },

  async captureAndDetect() {
    if (this.capturing || this.binding) return;
    if (this.scannerState === 'initializing') {
      this.setData({ status: '正在连接相机预览', hint: '请稍候', phase: 'initializing' });
      return;
    }
    if (this.scannerState !== 'ready' || !this.camera || !this.detector) {
      this.switchToVoiceMode('当前环境无法使用相机扫码');
      return;
    }

    this.capturing = true;
    this.setData({
      status: '正在拍照并识别',
      hint: '请保持二维码位于预览框内',
      phase: 'capturing'
    });

    try {
      // 与官方 scanner sample 一致：等待 takePhoto Promise 完整结束后，
      // 再按 mimeType 解码。真机主要返回 WebP，Craft 可能返回 PNG/JPEG。
      const camera = this.camera;
      const photo = await camera.takePhoto({ quality: 'high' });
      if (!photo || !photo.data) throw new Error('Camera did not return image data.');

      const input = await this.toBarcodeInput(photo);
      console.info('[moment-one:binding-scan] photo prepared', {
        mimeType: photo.mimeType || '',
        width: input.width,
        height: input.height,
        pixelByteLength: input.data && input.data.byteLength ? input.data.byteLength : 0,
        pixelFormat: input.pixelFormat
      });

      this.setData({
        status: `正在识别 ${input.width} × ${input.height} 照片`,
        hint: '请稍候',
        phase: 'capturing'
      });
      const detections = await this.detectFromPhoto(input);
      const detectedItems = Array.isArray(detections) ? detections : [];
      detectedItems.forEach((item, index) => {
        const rawValue = item && typeof item.rawValue === 'string' ? item.rawValue : '';
        console.info('[moment-one:binding-scan] QR content', {
          index,
          format: item && item.format ? item.format : 'unknown',
          rawValue
        });
      });

      const bindingCode = findBindingCode(detectedItems);
      console.info('[moment-one:binding-scan] detection complete', {
        detectionCount: detectedItems.length,
        formats: detectedItems.map((item) => item && item.format).filter(Boolean),
        containsMomentOneBinding: Boolean(bindingCode)
      });
      if (bindingCode) {
        await this.completeBinding(bindingCode);
        return;
      }

      if (detectedItems.length > 0) this.showScanError('二维码内容不是一刻绑定链接');
      else this.showScanError('未识别到二维码，请靠近后重试');
    } catch (error) {
      console.warn('[moment-one:binding-scan] capture or detection failed', {
        name: error && error.name,
        message: error && error.message
      });
      this.showScanError('扫码失败，请重新对准后重试');
    } finally {
      this.capturing = false;
      // Some hosts briefly hide the page while the native camera preview is
      // shown. onHide releases the context per the official sample; recreate
      // it after the capture so the next retry is not left without a context.
      if (this.pageActive && !this.binding && !this.camera) {
        this.scannerState = 'initializing';
        setTimeout(() => this.initializeScanner(), 0);
      }
    }
  },

  async toBarcodeInput(photo) {
    const mimeType = String(photo && photo.mimeType || '').toLowerCase();
    if (mimeType.includes('webp')) {
      const decoded = await decodeWebP(photo.data, { output: 'gray' });
      return {
        data: decoded.gray,
        width: decoded.width,
        height: decoded.height,
        pixelFormat: 'gray-webp'
      };
    }

    const decoded = decodeCameraImage(photo.data, mimeType);
    if (!decoded || !decoded.data) {
      throw new Error(`Unsupported or unreadable camera image: ${mimeType || 'unknown'}`);
    }
    return {
      data: decoded.data,
      width: decoded.width,
      height: decoded.height,
      pixelFormat: 'rgba'
    };
  },

  async detectFromPhoto(input) {
    // 真机 WebP 灰度输入按官方 scanner sample 直接交给 BarcodeDetector。
    // Craft PNG/JPEG 的 RGBA 输入若宿主未识别，再使用 AIX 内置 jsQR。
    const hostResults = await this.detector.detect({
      data: input.data,
      width: input.width,
      height: input.height
    });
    if (Array.isArray(hostResults) && hostResults.length > 0) return hostResults;

    if (input.pixelFormat === 'rgba') {
      const rawValue = decodeQrPixels(input.data, input.width, input.height);
      console.info('[moment-one:binding-scan] local QR decoder fallback', {
        found: Boolean(rawValue),
        pixelByteLength: input.data.byteLength
      });
      return rawValue ? [{ format: 'qr_code', rawValue }] : [];
    }
    return [];
  },

  showScanError(message) {
    this.setData({
      status: message,
      hint: '按确认键重试；按下一键切换语音',
      phase: 'error'
    });
  },

  startVoiceBinding() {
    if (this.recognitionActive || this.binding) return;

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.lang = 'zh-CN';
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.maxAlternatives = 1;

      this.recognition.onresult = (event) => {
        const result = event.results && event.results[0];
        const transcript = result && result[0] && result[0].transcript;
        const bindingCode = extractSpokenBindingCode(transcript);
        if (bindingCode) this.completeBinding(bindingCode);
        else {
          this.setData({
            status: '未听清有效绑定码',
            hint: '按确认键重新读出绑定码',
            phase: 'error'
          });
        }
      };

      this.recognition.onerror = () => {
        this.recognitionActive = false;
        this.setData({
          status: '语音识别失败',
          hint: '按确认键重试',
          phase: 'error'
        });
      };
      this.recognition.onend = () => {
        this.recognitionActive = false;
      };

      this.recognitionActive = true;
      this.setData({
        status: '请读出绑定码',
        hint: '正在聆听',
        phase: 'listening'
      });
      this.recognition.start();
    } catch (error) {
      this.recognitionActive = false;
      this.setData({
        status: '语音输入不可用',
        hint: this.camera ? '按下一键返回扫码' : '请稍后重试',
        phase: 'error'
      });
    }
  },

  stopRecognition() {
    if (!this.recognition) return;
    try {
      this.recognition.abort();
    } catch (error) {
      console.warn('Unable to stop binding recognition:', error);
    }
    this.recognition = null;
    this.recognitionActive = false;
  },

  async completeBinding(bindingCode) {
    if (this.binding) return;
    this.stopRecognition();
    this.binding = true;
    this.setData({
      status: '二维码有效，正在绑定账号',
      hint: '请保持网络连接',
      phase: 'binding'
    });

    const result = await requestBinding(bindingCode);
    if (!this.pageActive) return;

    if (result.success) {
      this.setData({
        status: '账号绑定成功',
        hint: '正在进入一刻',
        phase: 'success'
      });
      setTimeout(() => {
        if (this.pageActive) wx.redirectTo({ url: '/pages/index/index?fromBinding=true' });
      }, 500);
      return;
    }

    this.binding = false;
    const message = ERROR_HINTS[result.error] || ERROR_HINTS.UNKNOWN;
    this.setData({
      status: message,
      hint: this.currentMode === 'scan'
        ? '按确认键重新扫码'
        : '按确认键重新读出绑定码',
      phase: 'error'
    });
  },

  enterLocalMode() {
    this.currentMode = 'local';
    this.stopRecognition();
    this.setData({
      status: '进入本地模式',
      hint: 'Moment 仅保存在当前设备',
      modeLabel: '本地模式',
      phase: 'success'
    });
    setTimeout(() => {
      if (this.pageActive) wx.redirectTo({ url: '/pages/index/index?localMode=true' });
    }, 300);
  }
}
</script>

<page>
  <view class="scan-screen">
    <view class="scan-card phase-{{phase}}">
      <view class="scan-header">
        <text class="scan-title">绑定账号</text>
        <text class="scan-mode">{{modeLabel}}</text>
      </view>
      <view class="scan-body">
        <view class="camera-wrap">
          <camera class="scan-camera"></camera>
          <view class="scan-corner corner-top-left"></view>
          <view class="scan-corner corner-top-right"></view>
          <view class="scan-corner corner-bottom-left"></view>
          <view class="scan-corner corner-bottom-right"></view>
        </view>
        <view class="scan-copy">
          <text class="scan-status">{{status}}</text>
          <text class="scan-hint">{{hint}}</text>
        </view>
      </view>
      <view class="scan-footer">
        <text>确认：执行</text>
        <text>下一：切换</text>
        <text>返回：退出</text>
      </view>
    </view>
  </view>
</page>

<style>
.scan-screen {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-md);
  background-color: var(--color-background);
}

.scan-card {
  width: 416px;
  height: 320px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: var(--card-padding);
  border-width: var(--card-border-width);
  border-style: solid;
  border-color: var(--card-border-color);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
}

.scan-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom-width: var(--border-width-thin);
  border-bottom-style: solid;
  border-bottom-color: var(--border-color-muted);
}

.scan-title {
  color: var(--color-text-primary);
  font-size: 22px;
  line-height: 28px;
  font-weight: 700;
}

.scan-mode {
  color: var(--color-primary);
  font-size: 12px;
  line-height: 16px;
}

.scan-body {
  flex-grow: 1;
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-lg);
}

.camera-wrap {
  width: 176px;
  height: 132px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border-width: var(--border-width-thin);
  border-style: solid;
  border-color: var(--border-color-muted);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.scan-camera {
  width: 176px;
  height: 132px;
  background-color: #000000;
}

.scan-corner {
  width: 24px;
  height: 24px;
  position: absolute;
  border-color: var(--border-color-accent);
}

.corner-top-left {
  top: 8px;
  left: 8px;
  border-top-width: var(--border-width-default);
  border-top-style: solid;
  border-left-width: var(--border-width-default);
  border-left-style: solid;
}

.corner-top-right {
  top: 8px;
  right: 8px;
  border-top-width: var(--border-width-default);
  border-top-style: solid;
  border-right-width: var(--border-width-default);
  border-right-style: solid;
}

.corner-bottom-left {
  bottom: 8px;
  left: 8px;
  border-bottom-width: var(--border-width-default);
  border-bottom-style: solid;
  border-left-width: var(--border-width-default);
  border-left-style: solid;
}

.corner-bottom-right {
  right: 8px;
  bottom: 8px;
  border-right-width: var(--border-width-default);
  border-right-style: solid;
  border-bottom-width: var(--border-width-default);
  border-bottom-style: solid;
}

.scan-copy {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scan-status {
  color: var(--color-text-primary);
  font-size: 16px;
  line-height: 22px;
  font-weight: 600;
}

.scan-hint {
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 18px;
}

.scan-footer {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  padding-top: 8px;
  border-top-width: var(--border-width-thin);
  border-top-style: solid;
  border-top-color: var(--border-color-muted);
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}

.phase-success {
  border-color: var(--border-color-success);
}

.phase-error {
  border-color: var(--border-color-warning);
}
</style>
