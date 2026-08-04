<script def>
{
  "navigationBarTitleText": "一刻",
  "description": "应用入口欢迎页，展示应用名称、slogan 和进入提示，用户点击或唤醒后根据绑定状态分流。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {}
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { CONTROL, resolveControl } from '../../services/controls.js';

export default {
  data: {},

  onLoad() {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
  },

  onVoiceWakeup() {
    this.enterApp();
  },

  onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;
    if (control === CONTROL.ACTIVATE) {
      event.preventDefault();
      this.enterApp();
    }
  },

  enterApp() {
    const bound = wx.getStorageSync('deviceBound') === true;
    wx.redirectTo({
      url: bound ? '/pages/index/index' : '/pages/scan/scan'
    });
  }
}
</script>

<page>
  <view class="welcome-card">
    <text class="welcome-title">一刻</text>
    <text class="welcome-slogan">AI 替你记住人生</text>
    <text class="welcome-hint">点击进入</text>
  </view>
</page>

<style>
.welcome-card {
  width: 448px;
  height: 200px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  background-color: #000000;
}

.welcome-title {
  color: #00ff7f;
  font-size: 32px;
  line-height: 38px;
  font-weight: 700;
}

.welcome-slogan {
  color: #888888;
  font-size: 13px;
  line-height: 18px;
}

.welcome-hint {
  color: #888888;
  font-size: 11px;
  line-height: 15px;
  margin-top: 12px;
}
</style>
