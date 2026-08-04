<script def>
{
  "navigationBarTitleText": "一刻",
  "description": "应用主页（对话页面框架，对话功能待实现）。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "placeholder": { "type": "string" }
      }
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { CONTROL, resolveControl } from '../../services/controls.js';

export default {
  data: {
    placeholder: '对话功能即将上线'
  },

  onLoad() {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
  },

  onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;
    if (control === CONTROL.BACK) {
      event.preventDefault();
      wx.navigateBack();
    }
  }
}
</script>

<page>
  <view class="home-screen">
    <text class="home-title">一刻</text>
    <text class="home-placeholder">{{placeholder}}</text>
  </view>
</page>

<style>
.home-screen {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: #000000;
}

.home-title {
  color: #00ff7f;
  font-size: 24px;
  line-height: 30px;
  font-weight: 700;
}

.home-placeholder {
  color: #888888;
  font-size: 13px;
  line-height: 18px;
}
</style>
