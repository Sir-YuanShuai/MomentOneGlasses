function stripPrefix(text, pattern) {
  return String(text || '').replace(pattern, '').replace(/^[：:，,\s]+/, '').trim();
}

function baseIntent(type, fields = {}) {
  return {
    type,
    confidence: fields.confidence ?? 0.9,
    content: fields.content || '',
    query: fields.query || '',
    changes: fields.changes || {},
    configKey: fields.configKey || '',
    configValue: fields.configValue ?? null,
    period: fields.period || 'month',
    reason: fields.reason || '',
    source: fields.source || 'rules',
  };
}

export function looksLikeRecordableMoment(input) {
  const text = String(input || '').trim();
  if (text.length < 4) return false;
  if (/[？?]$/.test(text)) return false;
  if (/^(什么|为什么|怎么|怎样|如何|哪里|谁|多少|是否|能不能|可不可以|请问)/.test(text)) return false;
  if (/什么是|是什么意思|介绍一下|告诉我|帮我写|帮我翻译|计算一下|天气怎么样/.test(text)) return false;

  const temporal = /今天|昨天|刚刚|刚才|此刻|现在|第一次|终于|最近|早上|上午|中午|下午|晚上|今晚|周末/.test(text);
  const personal = /我|我们|妈妈|爸爸|家人|朋友|同事/.test(text);
  const scene = /这家|这里|眼前|路上|店里|公司|学校|家里|海边|湖边|山上/.test(text);
  const event = /去了|来到|出发|吃了|喝了|见了|遇到|看了|看海|听到|完成|学会|想到|发现|散步|跑步|旅行|开会|拍了|做了|买了|收到|带.+?看|一起/.test(text);
  const feeling = /开心|高兴|难过|焦虑|平静|感动|兴奋|疲惫|喜欢|很棒|不错|很好|好吃|好看|值得/.test(text);
  const observation = /天气|阳光|风景|味道|空气|晚霞|日出|日落|下雨|雨声|下雪|雪景|彩虹|花开|这家|这里/.test(text);

  return (temporal && (event || feeling || observation))
    || (personal && (event || feeling))
    || (scene && (event || feeling || observation));
}

export function fallbackRecognizeIntent(input) {
  const text = String(input || '').trim();
  if (!text) return baseIntent('unknown', { confidence: 1, reason: '没有输入' });

  if (/^(你好|嗨|在吗|你是谁|你能做什么|怎么用|帮助|使用说明)[啊呀吗？?！!，,\s]*$/.test(text)) {
    return baseIntent('help', { reason: '帮助或问候' });
  }

  if (/(?:解绑|解除绑定|退出|移除|更换|切换).*(?:账号|账户)|(?:账号|账户).*(?:解绑|解除绑定|退出|移除|更换|切换)/.test(text)) {
    return baseIntent('account.unbind.request', { confidence: 1, reason: '请求显示解绑账号确认卡片' });
  }

  if (/即刻记忆|快速记录|自动拍照|拍照功能|功能设置|功能配置|当前配置|设置状态/.test(text)) {
    if (/关闭|关掉|不要|停用|禁用|取消/.test(text)) {
      return baseIntent('config.set', {
        configKey: 'instant_memory',
        configValue: false,
        reason: '关闭快速记录',
      });
    }
    if (/开启|打开|启用|使用/.test(text)) {
      return baseIntent('config.set', {
        configKey: 'instant_memory',
        configValue: true,
        reason: '开启快速记录',
      });
    }
    return baseIntent('config.get', {
      configKey: /即刻记忆|快速记录|自动拍照|拍照功能/.test(text) ? 'instant_memory' : '',
      reason: '查询功能配置',
    });
  }

  // 记账统计（MCP Apps 入口）：明确的统计型措辞才命中，避免吞掉生活记录
  if (/记账|账本|账目|收支|结余|账单|统计.{0,4}(账|开销|消费)|(账|开销|消费).{0,4}统计|花了多少|用了多少|支出.{0,4}(多少|统计|总结|汇总|情况)|收入.{0,4}(多少|统计|总结|汇总|情况)|消费记录|开销记录/.test(text)) {
    const period = /本季度|本季|这个季度/.test(text) ? 'quarter'
      : /今年|本年|年度/.test(text) ? 'year'
      : 'month';
    return baseIntent('mcp.bookkeeping.summary', {
      period,
      reason: '请求记账统计（MCP bookkeeping_summary）',
    });
  }

  if (/(清空|全部删除|删除全部|删掉全部|清除所有|删除所有).*(记忆|记录|Moment|moment)?/.test(text)) {
    return baseIntent('moment.clear', { reason: '清空全部记忆' });
  }

  if (/删除|删掉|移除|清除/.test(text)) {
    const query = stripPrefix(text, /^(请|帮我|麻烦)?(删除|删掉|移除|清除)(一下)?/);
    return baseIntent('moment.delete', {
      query: query.replace(/(这条|那条)?(记忆|记录|Moment|moment)$/i, '$1').trim(),
      reason: '删除已有记忆',
    });
  }

  if (/修改|改成|改为|更正|纠正|更新|补充/.test(text)) {
    const targetMatch = text.match(/(?:把|将)?(.+?)(?:的)?(?:标题|地点|位置|标签|内容)(?:修改|改成|改为|更正|纠正|更新|补充)/);
    const changes = {};
    const titleMatch = text.match(/标题(?:修改|改成|改为|更正|纠正|更新|补充)(?:成|为)?[：:，,\s]*([^，。！？!?]+)/);
    const locationMatch = text.match(/(?:地点|位置)(?:修改|改成|改为|更正|纠正|更新|补充)(?:成|为)?[：:，,\s]*([^，。！？!?]+)/);
    const tagsMatch = text.match(/标签(?:修改|改成|改为|更正|纠正|更新|补充)(?:成|为)?[：:，,\s]*([^，。！？!?]+)/);
    if (titleMatch) changes.title = titleMatch[1].trim();
    if (locationMatch) changes.locationName = locationMatch[1].trim();
    if (tagsMatch) changes.tags = tagsMatch[1].split(/[、,，\s]+/).filter(Boolean);
    return baseIntent('moment.update', {
      confidence: 0.72,
      query: targetMatch ? targetMatch[1].replace(/的$/, '').trim() : text,
      changes,
      reason: '修改已有记忆',
    });
  }

  if (/^(请|帮我|麻烦)?(记录|记下|记住|保存|新增|添加|记一下|记一笔)(一下|这一刻|这个瞬间|这件事|一条记录)?/.test(text)) {
    return baseIntent('moment.create', {
      content: stripPrefix(text, /^(请|帮我|麻烦)?(记录|记下|记住|保存|新增|添加|记一下|记一笔)(一下|这一刻|这个瞬间|这件事|一条记录)?/),
      reason: '明确要求新增记录',
    });
  }

  if (/(记下来|保存下来|帮我记着)[。！!，,\s]*$/.test(text)) {
    return baseIntent('moment.create', {
      content: text.replace(/(请|麻烦)?(帮我)?(记下来|保存下来|帮我记着)[。！!，,\s]*$/, '').trim(),
      reason: '明确要求新增记录',
    });
  }

  if (/(我想|想要)?(记录|记住|保存)(住)?(这一刻|这个瞬间|此刻)/.test(text)) {
    return baseIntent('moment.create', {
      content: text,
      reason: '表达了保存当前生活片段的意图',
    });
  }

  if (/帮我找|找找|查一下|查询|搜索|查看|看看|列出|有哪些|多少条|回顾|总结|复盘|最近.*(做|去|吃|见)|今天.*(做了什么|发生了什么)|上次|哪天|哪里|谁|什么时候|去过|吃过|见过/.test(text)) {
    return baseIntent('moment.query', {
      query: stripPrefix(text, /^(请|帮我|麻烦)?(帮我找|找找|查一下|查询|搜索|查看|看看|列出|回顾一下|回顾|总结一下|总结|复盘)[：:，,\s]*/),
      reason: '查询或回顾记忆',
    });
  }

  if (looksLikeRecordableMoment(text)) {
    return baseIntent('moment.create', {
      confidence: 0.72,
      content: text,
      reason: '具体的个人生活陈述',
    });
  }

  return baseIntent('unknown', {
    confidence: 0.35,
    reason: '规则无法确定意图',
  });
}
