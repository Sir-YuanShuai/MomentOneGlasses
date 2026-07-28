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

export default {
  data: {
    moments: [],
    count: 0,
    focusIndex: 0
  },

  onLoad() {
    wx.setBackgroundColor({ backgroundColor: '#000000' });
    this.loadTimeline();
  },

  onShow() {
    this.loadTimeline();
  },

  loadTimeline() {
    const moments = presentTimeline(listMoments());
    this.setData({ moments, count: moments.length });
  },

  goBack() {
    wx.navigateBack();
  },

  openSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  activateFocused() {
    if (this.data.focusIndex === 0) this.goBack();
    if (this.data.focusIndex === 1) this.openSearch();
  },

  onKeyUp(event) {
    if (event.code === 'Enter') {
      event.preventDefault();
      this.activateFocused();
      return;
    }
    if (event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault();
      this.setData({ focusIndex: this.data.focusIndex === 0 ? 1 : 0 });
    }
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

    <scroll-view class="timeline-scroll" scroll-y="true">
      <view class="empty-state" ink:if="{{ moments.length === 0 }}">
        <view class="empty-mark"><text>记</text></view>
        <text class="empty-title">时间线还没有内容</text>
        <text class="empty-detail">回到记录页，说出“记录这一刻”</text>
      </view>

      <view class="timeline-list" ink:else>
        <view class="timeline-entry" ink:for="{{ moments }}" ink:key="id">
          <text class="date-divider" ink:if="{{ item.showDate }}">{{ item.dateLabel }}</text>
          <view class="moment-row">
            <view class="time-column">
              <text class="time-label">{{ item.timeLabel }}</text>
              <view class="time-line"></view>
            </view>
            <card class="moment-card" role="group">
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
    </scroll-view>

    <view class="action-row">
      <button class="secondary-action {{ focusIndex === 0 ? 'is-focused' : '' }}" bindtap="goBack">返回记录</button>
      <button class="primary-action {{ focusIndex === 1 ? 'is-focused' : '' }}" bindtap="openSearch">问问记忆</button>
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

.header-row {
  height: 48px;
  display: flex;
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
  height: 234px;
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

.action-row {
  height: 46px;
  display: flex;
  gap: var(--spacing-sm);
}

.primary-action, .secondary-action {
  flex-grow: 1;
  height: 40px;
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
