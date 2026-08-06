<script def>
{
  "navigationBarTitleText": "解绑账号",
  "description": "在 AIUI 对话流中展示解绑当前账号的确认卡片；确认操作后撤销当前设备授权并清除眼镜本地凭据。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "accountLabel": { "type": "string", "description": "当前账号的展示名称；缺省显示当前账号" },
        "status": { "type": "string", "enum": ["confirm", "processing", "success", "cancelled", "error"] },
        "message": { "type": "string" },
        "remoteRevoked": { "type": "boolean" },
        "selectedAction": { "type": "string", "enum": ["confirm", "cancel"] }
      },
      "required": ["status", "message"]
    }
  }
}
</script>

<script setup>
import wx from 'wx';
import { CONTROL, resolveControl } from '../../services/controls.js';
import { unbindAccount } from '../../services/binding.js';

export default {
  data: {
    accountLabel: '当前账号',
    status: 'confirm',
    message: '解绑后需要重新扫码才能继续使用账号功能。',
    remoteRevoked: false,
    busy: false,
    selectedAction: 'confirm'
  },

  onLoad(query) {
    this.setData({
      accountLabel: query && query.accountLabel ? query.accountLabel : '当前账号',
      status: 'confirm',
      message: '解绑后会清除本机账号凭据，需要重新扫码才能继续使用账号功能。',
      remoteRevoked: false,
      busy: false,
      selectedAction: 'confirm'
    });
  },

  onKeyUp(event) {
    const control = resolveControl(event && event.code);
    if (!control) return;
    event.preventDefault();

    if (control === CONTROL.BACK) {
      if (this.data.status === 'confirm') this.cancelUnbind();
      this.leaveCard();
      return;
    }

    if (this.data.status !== 'confirm' || this.data.busy) return;
    if (control === CONTROL.NEXT || control === CONTROL.PREVIOUS) {
      this.setData({ selectedAction: this.data.selectedAction === 'confirm' ? 'cancel' : 'confirm' });
      return;
    }
    if (control === CONTROL.ACTIVATE) {
      if (this.data.selectedAction === 'cancel') {
        this.cancelUnbind();
        this.leaveCard();
      } else {
        this.confirmUnbind();
      }
    }
  },

  leaveCard() {
    try {
      wx.navigateBack({ delta: 1 });
    } catch (error) {
      wx.redirectTo({ url: '/pages/index/index?fromBinding=true' });
    }
  },

  async confirmUnbind() {
    if (this.data.busy || this.data.status !== 'confirm') return;
    this.setData({
      busy: true,
      status: 'processing',
      message: '正在撤销账号授权并清除本机凭据，请稍候。'
    });

    try {
      const result = await unbindAccount();
      this.setData({
        busy: false,
        status: 'success',
        remoteRevoked: Boolean(result.remoteRevoked),
        message: result.remoteRevoked
          ? '账号已解绑，服务端授权和本机账号凭据均已清除。'
          : '账号已从本机移除；服务端授权可在 Web 端确认撤销。'
      });
    } catch (error) {
      this.setData({
        busy: false,
        status: 'error',
        message: '解绑没有完成，请检查网络后重试。'
      });
    }
  },

  cancelUnbind() {
    if (this.data.busy) return;
    this.setData({
      status: 'cancelled',
      message: '已取消解绑，当前账号仍保持绑定。'
    });
  }
};
</script>

<page>
  <view class="card-shell">
    <view class="card-head">
      <text class="eyebrow">账号安全</text>
      <text class="state-label">{{ status === 'confirm' ? '待确认' : status === 'processing' ? '处理中' : status === 'success' ? '已完成' : status === 'cancelled' ? '已取消' : '未完成' }}</text>
    </view>
    <text class="title">{{ status === 'confirm' ? '确认解绑账号？' : status === 'processing' ? '正在解绑账号' : status === 'success' ? '账号已解绑' : status === 'cancelled' ? '已取消解绑' : '解绑没有完成' }}</text>
    <text class="account">{{ accountLabel }}</text>
    <text class="message">{{ message }}</text>

    <view class="actions" ink:if="{{ status === 'confirm' }}">
      <button class="button button-danger {{ selectedAction === 'confirm' ? 'button-selected' : '' }}" bindtap="confirmUnbind">确认解绑</button>
      <button class="button button-secondary {{ selectedAction === 'cancel' ? 'button-selected' : '' }}" bindtap="cancelUnbind">取消</button>
    </view>
    <text class="key-hint" ink:if="{{ status === 'confirm' }}">确认键执行 · 下一键切换 · 返回键取消</text>

    <text class="hint" ink:if="{{ status === 'success' }}">如需继续使用，请重新扫码绑定账号。</text>
    <text class="hint" ink:if="{{ status === 'cancelled' || status === 'error' }}">可以继续使用当前账号，或稍后重新操作。</text>
  </view>
</page>

<style>
.card-shell {
  width: 448px;
  min-height: 176px;
  box-sizing: border-box;
  padding: var(--spacing-lg);
  background-color: var(--color-background);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}
.card-head {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}
.eyebrow { color: var(--color-primary); font-size: 12px; font-weight: 700; }
.state-label { color: var(--color-text-secondary); font-size: 11px; }
.title { font-size: 21px; line-height: 27px; font-weight: 700; }
.account { color: var(--color-primary); font-size: 14px; line-height: 20px; }
.message { color: var(--color-text-secondary); font-size: 13px; line-height: 19px; }
.actions { display: flex; flex-direction: row; gap: var(--spacing-sm); margin-top: var(--spacing-sm); }
.button { min-width: 132px; min-height: 36px; border-radius: var(--radius-md); font-size: 13px; }
.button-danger { color: var(--color-background); background-color: var(--color-primary); }
.button-secondary { color: var(--color-text-primary); background-color: var(--color-surface); border: var(--border-width-thin) solid var(--border-color-muted); }
.button-selected { outline: var(--border-width-default) solid var(--color-primary); outline-offset: 2px; }
.key-hint { color: var(--color-primary); font-size: 11px; line-height: 16px; }
.hint { margin-top: var(--spacing-sm); color: var(--color-text-secondary); font-size: 11px; line-height: 16px; }
</style>
