<script def>
{
  "navigationBarTitleText": "记忆回答",
  "description": "在对话流中只读展示基于用户 Moment 证据生成的记忆回答、证据数量和最多三条相关 Moment 摘要。",
  "schema": {
    "data": {
      "type": "object",
      "properties": {
        "question": { "type": "string", "description": "用户的记忆问题" },
        "answer": { "type": "string", "description": "只依据 Moment 证据生成的回答" },
        "evidenceCount": { "type": "number", "description": "证据 Moment 数量" },
        "items": {
          "type": "array",
          "maxItems": 3,
          "items": {
            "type": "object",
            "properties": {
              "title": { "type": "string" },
              "meta": { "type": "string" }
            },
            "required": ["title"]
          }
        }
      },
      "required": ["question", "answer", "evidenceCount"]
    }
  }
}
</script>

<script setup>
export default {
  data: {
    question: '',
    answer: '',
    evidenceCount: 0,
    items: []
  },

  onLoad(input) {
    this.setData({
      question: input && input.question ? input.question : '',
      answer: input && input.answer ? input.answer : '暂未找到足够的记录。',
      evidenceCount: Number(input && input.evidenceCount ? input.evidenceCount : 0),
      items: input && Array.isArray(input.items) ? input.items.slice(0, 3) : []
    });
  }
}
</script>

<page>
  <view class="card-shell">
    <view class="head-row">
      <text class="eyebrow">记忆回答</text>
      <text class="count">{{ evidenceCount }} 条证据</text>
    </view>
    <text class="question">“{{ question }}”</text>
    <text class="answer">{{ answer }}</text>
    <view class="evidence-list" ink:if="{{ items.length }}">
      <view class="evidence-item" ink:for="{{ items }}" ink:key="title">
        <text class="item-title">{{ item.title }}</text>
        <text class="item-meta" ink:if="{{ item.meta }}">{{ item.meta }}</text>
      </view>
    </view>
    <text class="hint">回答仅来自你自己的 Moment</text>
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
  gap: var(--spacing-sm);
}
.head-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.eyebrow, .count { font-size: 11px; line-height: 15px; }
.eyebrow { color: var(--color-primary); font-weight: 700; }
.count { color: var(--color-text-secondary); }
.question { font-size: 13px; line-height: 18px; color: var(--color-primary); }
.answer { font-size: 17px; line-height: 24px; font-weight: 700; }
.evidence-list { display: flex; flex-direction: column; gap: 4px; }
.evidence-item {
  padding: 5px 7px;
  border: var(--border-width-thin) solid var(--border-color-muted);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}
.item-title { font-size: 11px; line-height: 15px; }
.item-meta { font-size: 10px; line-height: 14px; color: var(--color-text-secondary); }
.hint {
  margin-top: auto;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
}
</style>
