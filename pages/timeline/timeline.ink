<script def>
{
  "navigationBarTitleText": "我的时间线",
  "description": "按时间倒序展示用户已记录的生活 Moment，包括日期、时间、分类、标签和 AI 摘要。",
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
import { listMoments } from '../../services/memory-store.js';
import { presentTimeline } from '../../services/format.js';
import { CONTROL, moveFocus, resolveControl } from '../../services/controls.js';

export default {
  data: {
    moments: [],
    count: 0,
    focusIndex: 0,
    activeAnchor: '',
    interactionHint: '上下浏览，点击键朗读；返回键退出'
  },

  onLoad() {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.loadTimeline();
  },

  onShow() {
    this.loadTimeline();
  },

  loadTimeline() {
    const timeline = presentTimeline(listMoments());
    const total = timeline.length + 2;
    const focusIndex = Math.min(this.data.focusIndex || 0, total - 1);
    const moments = timeline.map((moment, index) => ({
      ...moment,
      focusIndex: index,
      anchorId: `moment-${index}`,
      focusClass: focusIndex === index ? 'is-focused' : ''
    }));
    this.setData({
      moments,
      count: moments.length,
      focusIndex,
      activeAnchor: focusIndex < moments.length ? moments[focusIndex].anchorId : ''
    });
  },

  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  openSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  openVoiceSearch() {
    wx.navigateTo({ url: '/pages/search/search?initialListen=true' });
  },

  speakFocusedMoment() {
    const moment = this.data.moments[this.data.focusIndex];
    if (!moment) return;
    this.setData({ interactionHint: `正在朗读：${moment.title}` });
    try {
      wx.speech.playTTS(`${moment.title}。${moment.aiSummary || ''}`);
    } catch (error) {
      console.warn('Timeline TTS unavailable:', error);
      this.setData({ interactionHint: moment.aiSummary || moment.title });
    }
  },

  activateFocused() {
    if (this.data.focusIndex < this.data.count) {
      this.speakFocusedMoment();
      return;
    }
    if (this.data.focusIndex === this.data.count) this.goBack();
    if (this.data.focusIndex === this.data.count + 1) this.openSearch();
  },

  moveTimelineFocus(delta) {
    const total = this.data.count + 2;
    const focusIndex = moveFocus(this.data.focusIndex, total, delta);
    this.setData({
      moments: this.data.moments.map((moment) => ({
        ...moment,
        focusClass: moment.focusIndex === focusIndex ? 'is-focused' : ''
      })),
      focusIndex,
      activeAnchor: focusIndex < this.data.count
        ? this.data.moments[focusIndex].anchorId
        : '',
      interactionHint: focusIndex < this.data.count
        ? '上下浏览，点击键朗读；返回键退出'
        : '点击键确认当前操作'
    });
  },

  onVoiceWakeup(event) {
    console.log('Timeline voice wakeup:', event && event.keyword);
    this.openVoiceSearch();
  },

  onKeyUp(event) {
    const control = resolveControl(event.code);
    if (!control) return;
    event.preventDefault();

    if (control === CONTROL.BACK) {
      this.goBack();
      return;
    }
    if (control === CONTROL.ACTIVATE) {
      this.activateFocused();
      return;
    }
    this.moveTimelineFocus(control === CONTROL.NEXT ? 1 : -1);
  }
}
</script>

<page>
  <view class="app-shell">
    <view class="header-row">
      <view class="header-copy">
        <text class="eyebrow">PERSONAL MEMORY</text>
        <text class="page-title">我的生活时间线</text>
      </view>
      <text class="count-label">{{ count }} 个瞬间</text>
    </view>

    <scroll-view class="timeline-scroll" scroll-y="true" scroll-into-view="{{ activeAnchor }}">
      <view class="empty-state" ink:if="{{ moments.length === 0 }}">
        <view class="empty-mark"><text>记</text></view>
        <text class="empty-title">时间线还没有内容</text>
        <text class="empty-detail">回到记录页，说出“记录这一刻”</text>
      </view>

      <view class="timeline-list" ink:else>
        <view ink:for="{{ moments }}" ink:key="id">
          <view id="{{ item.anchorId }}" class="timeline-entry">
          <text class="date-divider" ink:if="{{ item.showDate }}">{{ item.dateLabel }}</text>
          <view class="moment-row">
            <view class="time-column">
              <text class="time-label">{{ item.timeLabel }}</text>
              <view class="time-line"></view>
            </view>
            <card class="moment-card {{ item.focusClass }}" role="group">
              <view class="moment-heading">
                <view class="category-mark"><text>{{ item.categoryMark }}</text></view>
                <view class="moment-copy">
                  <text class="moment-title">{{ item.title }}</text>
                  <text class="moment-meta">{{ item.categoryLabel }} · {{ item.locationLabel }}</text>
                </view>
              </view>
              <text class="moment-summary">{{ item.aiSummary }}</text>
              <text class="moment-tags">{{ item.tagsText }}</text>
            </card>
          </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <text class="interaction-hint">{{ interactionHint }}</text>

    <view id="timeline-actions" class="action-row">
      <button class="secondary-action {{ focusIndex === count ? 'is-focused' : '' }}" bindtap="goBack">返回记录</button>
      <button class="primary-action {{ focusIndex === count + 1 ? 'is-focused' : '' }}" bindtap="openSearch">问问记忆</button>
    </view>
  </view>
</page>

<style>
.app-shell {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  padding: 10px 12px;
  background-color: var(--color-background);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-row {
  height: 44px;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.header-copy {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.eyebrow, .count-label, .moment-meta, .moment-summary, .moment-tags, .empty-detail {
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

.count-label {
  font-size: 11px;
  line-height: 16px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
  padding: 3px 7px;
}

.timeline-scroll {
  width: 100%;
  height: 190px;
}

.timeline-list, .timeline-entry {
  width: 100%;
  display: flex;
  flex-direction: column;
}

.timeline-list {
  gap: 5px;
}

.date-divider {
  color: var(--color-primary);
  font-size: 11px;
  line-height: 16px;
  font-weight: 700;
  margin: 3px 0;
}

.moment-row {
  width: 100%;
  display: flex;
  flex-direction: row;
  gap: var(--spacing-sm);
}

.time-column {
  width: 46px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.time-label {
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 16px;
}

.time-line {
  width: var(--border-width-thin);
  height: 74px;
  background-color: var(--border-color-muted);
}

.moment-card {
  width: 354px;
  box-sizing: border-box;
  padding: 9px;
  border: var(--card-border-width) solid var(--card-border-color);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 0 7px 0;
}

.moment-heading {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--spacing-sm);
}

.category-mark {
  width: 30px;
  height: 30px;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: 15px;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.moment-copy {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.moment-title {
  font-size: 14px;
  line-height: 18px;
  font-weight: 700;
}

.moment-meta, .moment-summary, .moment-tags {
  font-size: 10px;
  line-height: 14px;
}

.moment-tags {
  color: var(--color-primary-60);
}

.empty-state {
  width: 100%;
  height: 220px;
  border: var(--card-border-width) solid var(--card-border-color);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
}

.empty-mark {
  width: 48px;
  height: 48px;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: 24px;
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-title {
  font-size: 16px;
  line-height: 20px;
  font-weight: 700;
}

.empty-detail {
  font-size: 11px;
  line-height: 15px;
}

.interaction-hint {
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
  text-align: center;
}

.action-row {
  height: 40px;
  display: flex;
  flex-direction: row;
  gap: var(--spacing-sm);
}

.primary-action, .secondary-action {
  width: 200px;
  height: 38px;
  box-sizing: border-box;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.primary-action {
  color: var(--color-background);
  background-color: var(--color-primary);
  border: var(--border-width-default) solid var(--border-color-accent);
  font-weight: 700;
}

.secondary-action {
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  border: var(--border-width-default) solid var(--border-color-muted);
}

.is-focused {
  outline: var(--border-width-strong) solid var(--border-color-accent);
  outline-offset: 2px;
}
</style>
