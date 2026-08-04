<script def>
{
  "navigationBarTitleText": "绑定设备",
  "description": "扫码绑定页，自动打开相机扫描二维码，扫到后标记已绑定并跳转主页。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "status": { "type": "string" },
        "hint": { "type": "string" }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { CONTROL, resolveControl } from '../../services/controls.js';

const BINDING_STORAGE_KEY = 'deviceBound';

export default {
  data: {
    status: '正在打开相机',
    hint: '请扫描绑定二维码'
  },

  onLoad() {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.scanning = false;
    this.startScan();
  },

  onUnload() {
    this.scanning = false;
  },

  onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;
    if (control === CONTROL.BACK) {
      event.preventDefault();
      wx.navigateBack();
    }
  },

  async startScan() {
    if (this.scanning) return;
    this.scanning = true;

    try {
      const BarcodeDetector = globalThis.BarcodeDetector;
      if (!BarcodeDetector) {
        this.setData({ status: '暂不支持扫码', hint: '请确认设备支持二维码识别' });
        this.scanning = false;
        return;
      }

      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      const camera = wx.media && wx.media.createCameraContext
        ? wx.media.createCameraContext()
        : null;

      if (!camera) {
        this.setData({ status: '相机不可用', hint: '请确认设备相机权限' });
        this.scanning = false;
        return;
      }

      this.setData({ status: '扫码中', hint: '请将二维码对准相机' });

      // 轮询拍照 + 识别二维码
      const poll = async () => {
        if (!this.scanning) return;
        try {
          const photo = await camera.takePhoto({ quality: 'low' });
          const bitmap = await createImageBitmap(new Blob([photo.data], { type: photo.mimeType || 'image/jpeg' }));
          const codes = await detector.detect(bitmap);
          bitmap.close && bitmap.close();

          if (codes && codes.length > 0) {
            const value = codes[0].rawValue || '';
            this.onScanSuccess(value);
            return;
          }
        } catch (error) {
          // 单帧识别失败，继续下一帧
        }

        setTimeout(poll, 800);
      };

      setTimeout(poll, 300);
    } catch (error) {
      this.setData({
        status: '扫码启动失败',
        hint: error && error.message ? error.message : '请重试'
      });
      this.scanning = false;
    }
  },

  onScanSuccess(value) {
    this.scanning = false;
    wx.setStorageSync(BINDING_STORAGE_KEY, true);
    this.setData({ status: '绑定成功', hint: '正在进入主页' });
    setTimeout(() => {
      wx.redirectTo({ url: '/pages/index/index' });
    }, 600);
  }
}
</script>

<page>
  <view class="scan-screen">
    <text class="scan-title">绑定设备</text>
    <text class="scan-status">{{status}}</text>
    <text class="scan-hint">{{hint}}</text>
  </view>
</page>

<style>
.scan-screen {
  width: 448px;
  height: 200px;
  margin-top: 76px;
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

.scan-status {
  color: #ffffff;
  font-size: 14px;
  line-height: 20px;
}

.scan-hint {
  color: #888888;
  font-size: 12px;
  line-height: 16px;
}
</style>
