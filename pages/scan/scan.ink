<script def>
{
  "navigationBarTitleText": "绑定设备",
  "description": "设备绑定页。支持扫码绑定（如设备支持 BarcodeDetector）和语音输入绑定码两种方式；连按两次返回键可跳过绑定进入本地模式。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "status": { "type": "string" },
        "hint": { "type": "string" },
        "mode": { "type": "string", "description": "当前绑定模式：scan / voice / local" }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import BarcodeDetector from 'barcode';
import { SpeechRecognition } from 'speech';
import { CONTROL, resolveControl } from '../../services/controls.js';
import { parseQrPayload, requestBinding } from '../../services/binding.js';

const ERROR_HINTS = {
  BINDING_CODE_EXPIRED: '二维码已过期，请在手机端刷新',
  BINDING_CODE_USED: '二维码已被使用，请在手机端重新生成',
  DEVICE_ALREADY_BOUND: '此设备已绑定其他账号',
  NETWORK_ERROR: '网络不可用，请检查后重试',
  UNKNOWN: '绑定失败，请重试'
};

// ============================================================
// 从 JPEG 字节中解析 width / height
// ============================================================
function parseJpegSize(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      return { width, height };
    }
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    offset += 2 + length;
  }
  return null;
}

// ============================================================
// 从语音识别结果中提取绑定码
// 支持格式：直接读码、"绑定码是 xxx"、"code is xxx"
// ============================================================
function extractBindingCode(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return null;
  // 直接就是绑定码（字母数字组合）
  if (/^[A-Za-z0-9]{6,32}$/.test(text)) return text;
  // "绑定码是 xxx" / "code is xxx" / "码是 xxx"
  const patterns = [
    /绑定码[是为：:\s]+([A-Za-z0-9]+)/i,
    /code\s+is\s+([A-Za-z0-9]+)/i,
    /码[是为：:\s]+([A-Za-z0-9]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1];
  }
  // 去掉空格和标点后尝试
  const cleaned = text.replace(/[\s，。、！？.,!?]/g, '');
  if (/^[A-Za-z0-9]{6,32}$/.test(cleaned)) return cleaned;
  return null;
}

export default {
  data: {
    status: '正在初始化',
    hint: '请稍候',
    mode: 'scan'
  },

  async onLoad() {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.binding = false;
    this.capturing = false;
    this.detector = null;
    this.camera = null;
    this.recognition = null;
    this.recognitionActive = false;
    this.backPressCount = 0;
    this.backPressTimer = null;

    // ============================================================
    // 检测 BarcodeDetector 能力（模块导入 + 全局回退）
    // ============================================================
    const DetectorCtor = BarcodeDetector || globalThis.BarcodeDetector;
    if (DetectorCtor) {
      try {
        const formats = await DetectorCtor.getSupportedFormats();
        if (formats && formats.length > 0) {
          this.detector = formats.includes('qr_code')
            ? new DetectorCtor({ formats: ['qr_code'] })
            : new DetectorCtor();
        } else {
          this.detector = new DetectorCtor();
        }
      } catch (e) {
        try {
          this.detector = new DetectorCtor();
        } catch (e2) {
          this.detector = null;
        }
      }
    }

    // ============================================================
    // 检测相机能力
    // ============================================================
    if (wx.media && wx.media.createCameraContext) {
      try {
        this.camera = wx.media.createCameraContext();
      } catch (e) {
        this.camera = null;
      }
    }

    // ============================================================
    // 根据能力选择模式
    // ============================================================
    if (this.detector && this.camera) {
      this.setData({
        status: '按下确认键扫码',
        hint: '将二维码对准相机后按确认键。或按下一键切换语音输入',
        mode: 'scan'
      });
    } else {
      // 设备不支持扫码 → 直接进入语音绑定模式
      this.switchToVoiceMode();
    }
  },

  onUnload() {
    this.binding = false;
    this.capturing = false;
    this.stopRecognition();
  },

  onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;

    if (control === CONTROL.BACK) {
      event.preventDefault();
      // 连按 2 次返回键 → 跳过绑定，进入本地模式
      this.backPressCount += 1;
      if (this.backPressTimer) clearTimeout(this.backPressTimer);
      if (this.backPressCount >= 2) {
        this.backPressCount = 0;
        this.enterLocalMode();
        return;
      }
      this.backPressTimer = setTimeout(() => {
        this.backPressCount = 0;
      }, 1500);
      // 单次返回 → 回到欢迎页
      wx.redirectTo({ url: '/pages/welcome/welcome' });
      return;
    }

    if (control === CONTROL.ACTIVATE) {
      event.preventDefault();
      if (this.data.mode === 'scan') {
        this.captureAndDetect();
      } else if (this.data.mode === 'voice') {
        this.startVoiceBinding();
      }
      return;
    }

    if (control === CONTROL.NEXT) {
      event.preventDefault();
      // 切换绑定模式
      if (this.data.mode === 'scan') {
        this.switchToVoiceMode();
      } else if (this.data.mode === 'voice' && this.detector && this.camera) {
        this.switchToScanMode();
      }
      return;
    }
  },

  // ============================================================
  // 模式切换
  // ============================================================
  switchToVoiceMode() {
    this.stopRecognition();
    this.setData({
      status: '语音输入绑定码',
      hint: '按确认键开始说话，读出绑定码。连按 2 次返回键跳过',
      mode: 'voice'
    });
  },

  switchToScanMode() {
    this.stopRecognition();
    this.setData({
      status: '按下确认键扫码',
      hint: '将二维码对准相机后按确认键。或按下一键切换语音输入',
      mode: 'scan'
    });
  },

  // ============================================================
  // 扫码模式
  // ============================================================
  async captureAndDetect() {
    if (this.capturing || this.binding) return;
    if (!this.detector || !this.camera) {
      this.switchToVoiceMode();
      return;
    }

    this.capturing = true;
    this.setData({ status: '正在拍照识别', hint: '请保持稳定' });

    try {
      const photo = await this.camera.takePhoto({ quality: 'low' });
      if (!photo || !photo.data) {
        this.setData({ status: '拍照失败', hint: '请重试' });
        return;
      }

      const size = parseJpegSize(photo.data);
      const image = size
        ? { width: size.width, height: size.height, data: photo.data }
        : { width: 640, height: 480, data: photo.data };

      const codes = await this.detector.detect(image);
      if (codes && codes.length > 0) {
        const value = codes[0].rawValue || '';
        this.onScanSuccess(value);
        return;
      }

      this.setData({ status: '未识别到二维码', hint: '请重新对准后按确认键' });
    } catch (error) {
      const msg = error && error.message ? error.message : '拍照或识别失败';
      this.setData({ status: '扫码失败', hint: msg });
    } finally {
      this.capturing = false;
    }
  },

  // ============================================================
  // 语音绑定模式
  // ============================================================
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
        if (!result) return;
        const transcript = result[0] && result[0].transcript;
        this.setData({ status: '听到：' + (transcript || ''), hint: '正在解析绑定码' });
        const code = extractBindingCode(transcript);
        if (code) {
          this.onScanSuccess(code);
        } else {
          this.setData({
            status: '未识别到绑定码',
            hint: '请按确认键重新说，读出绑定码'
          });
        }
      };

      this.recognition.onerror = (event) => {
        this.recognitionActive = false;
        const err = event && event.error ? event.error : '未知错误';
        this.setData({
          status: '语音识别失败',
          hint: err + '，请重试'
        });
      };

      this.recognition.onend = () => {
        this.recognitionActive = false;
      };

      this.recognition.start();
      this.recognitionActive = true;
      this.setData({ status: '正在听', hint: '请读出绑定码' });
    } catch (e) {
      this.setData({
        status: '语音不可用',
        hint: '请连按 2 次返回键跳过绑定'
      });
    }
  },

  stopRecognition() {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (e) {
        // ignore
      }
      this.recognition = null;
    }
    this.recognitionActive = false;
  },

  // ============================================================
  // 绑定成功处理（扫码和语音共用）
  // ============================================================
  async onScanSuccess(value) {
    if (this.binding) return;
    this.binding = true;
    this.capturing = false;
    this.stopRecognition();

    // value 可能是二维码 payload（momentone://bind?code=xxx）或直接绑定码
    let bindingCode = parseQrPayload(value);
    if (!bindingCode) {
      // 直接就是绑定码
      bindingCode = /^[A-Za-z0-9]{6,32}$/.test(value) ? value : null;
    }

    if (!bindingCode) {
      this.setData({ status: '非有效绑定码', hint: '请重试' });
      this.binding = false;
      return;
    }

    this.setData({ status: '正在绑定', hint: '请稍候' });

    const result = await requestBinding(bindingCode);
    if (result.success) {
      this.setData({ status: '绑定成功', hint: '正在进入主页' });
      setTimeout(() => {
        wx.redirectTo({ url: '/pages/index/index' });
      }, 600);
      return;
    }

    const hint = ERROR_HINTS[result.error] || ERROR_HINTS.UNKNOWN;
    this.setData({ status: '绑定失败', hint });
    this.binding = false;
  },

  // ============================================================
  // 跳过绑定，进入本地模式
  // ============================================================
  enterLocalMode() {
    this.stopRecognition();
    this.setData({ status: '本地模式', hint: '跳过绑定，数据仅存于设备本地' });
    setTimeout(() => {
      wx.redirectTo({ url: '/pages/index/index?localMode=true' });
    }, 800);
  }
}
</script>

<page>
  <view class="scan-screen">
    <text class="scan-title">绑定设备</text>
    <text class="scan-mode">{{mode === 'scan' ? '扫码模式' : (mode === 'voice' ? '语音模式' : '本地模式')}}</text>
    <text class="scan-status">{{status}}</text>
    <text class="scan-hint">{{hint}}</text>
  </view>
</page>

<style>
.scan-screen {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background-color: #000000;
}

.scan-title {
  color: #00ff7f;
  font-size: 22px;
  line-height: 28px;
  font-weight: 700;
}

.scan-mode {
  color: #00ff7f;
  font-size: 12px;
  line-height: 16px;
  opacity: 0.7;
}

.scan-status {
  color: #ffffff;
  font-size: 14px;
  line-height: 20px;
}

.scan-hint {
  color: #888888;
  font-size: 12px;
  line-height: 16px;
  text-align: center;
  padding: 0 24px;
}
</style>
