<script def>
{
  "navigationBarTitleText": "Moment 结果",
  "description": "在对话流中展示一次 Moment 新增、修改、删除或配置操作的只读结果，包括状态、标题、摘要、时间、地点和标签。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "operationLabel": { "type": "string", "description": "操作类型，例如已记录、已修改、待确认" },
        "statusTitle": { "type": "string", "description": "结果主标题" },
        "summary": { "type": "string", "description": "结果摘要" },
        "timeLabel": { "type": "string", "description": "可读时间" },
        "locationName": { "type": "string", "description": "地点名称" },
        "tagsText": { "type": "string", "description": "标签文本" },
        "continuationHint": { "type": "string", "description": "建议用户继续说的语音提示" }
      },
      "required": ["operationLabel", "statusTitle", "summary"]
    }
  }
}
</script>

<script setup>
export default {
  data: {
    operationLabel: 'Moment',
    statusTitle: '',
    summary: '',
    timeLabel: '',
    locationName: '',
    tagsText: '',
    continuationHint: '可继续用语音查询或修改'
  },

  onLoad(input) {
    this.setData({
      operationLabel: input && input.operationLabel ? input.operationLabel : 'Moment',
      statusTitle: input && input.statusTitle ? input.statusTitle : '',
      summary: input && input.summary ? input.summary : '',
      timeLabel: input && input.timeLabel ? input.timeLabel : '',
      locationName: input && input.locationName ? input.locationName : '',
      tagsText: input && input.tagsText ? input.tagsText : '',
      continuationHint: input && input.continuationHint ? input.continuationHint : '可继续用语音查询或修改'
    });
  }
}
</script>

<page>
  <view class="card-shell">
    <view class="card-head">
      <text class="eyebrow">{{ operationLabel }}</text>
      <text class="status-mark">M</text>
    </view>
    <text class="title">{{ statusTitle }}</text>
    <text class="summary">{{ summary }}</text>
    <view class="meta-row" ink:if="{{ timeLabel || locationName }}">
      <text ink:if="{{ timeLabel }}">{{ timeLabel }}</text>
      <text class="divider" ink:if="{{ timeLabel && locationName }}">·</text>
      <text ink:if="{{ locationName }}">{{ locationName }}</text>
    </view>
    <text class="tags" ink:if="{{ tagsText }}">{{ tagsText }}</text>
    <text class="hint">{{ continuationHint }}</text>
  </view>
</page>

<style>
.card-shell {
  width: 448px;
  height: 352px;
  box-sizing: border-box;
  padding: var(--spacing-lg);
  background-color: var(--color-background);
  color: var(--color-text-primary);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--spacing-sm);
}
.card-head, .meta-row {
  display: flex;
  flex-direction: row;
  align-items: center;
}
.card-head { justify-content: space-between; }
.eyebrow, .status-mark, .tags { color: var(--color-primary); }
.eyebrow { font-size: 12px; line-height: 16px; font-weight: 700; }
.status-mark {
  width: 28px;
  height: 28px;
  border: var(--border-width-default) solid var(--border-color-accent);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}
.title { font-size: 22px; line-height: 28px; font-weight: 700; }
.summary { font-size: 14px; line-height: 21px; color: var(--color-text-secondary); }
.meta-row { gap: 6px; font-size: 11px; line-height: 15px; color: var(--color-text-secondary); }
.divider { color: var(--color-primary); }
.tags { font-size: 11px; line-height: 15px; }
.hint {
  margin-top: var(--spacing-sm);
  padding-top: var(--spacing-sm);
  border-top: var(--border-width-thin) solid var(--border-color-muted);
  color: var(--color-text-secondary);
  font-size: 11px;
  line-height: 15px;
}
</style>
