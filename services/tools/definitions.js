export const MOMENT_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'moment_create',
      description: '保存一条新的个人生活 Moment。用户直接表达具体生活经历、当下观察、感受、地点、美食、灵感或日常事件时即可调用，不要求出现“记录”命令。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '用户希望保存的生活事实，不包含记录命令前缀',
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moment_search',
      description: '查询、统计、列出、回顾或总结用户自己的 Moment。',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '用户原始记忆问题',
          },
          mode: {
            type: 'string',
            enum: ['search', 'count', 'review', 'summary'],
          },
          timeRange: {
            type: 'string',
            enum: ['today', 'yesterday', 'this_week', 'last_week', 'recent', 'all', 'unspecified'],
          },
        },
        required: ['query', 'mode'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moment_update',
      description: '修改或纠正一条已有 Moment。目标或修改内容不明确时不要调用。',
      parameters: {
        type: 'object',
        properties: {
          targetReference: {
            type: 'string',
            description: '上一条、刚才那条、标题、时间、地点或事件描述',
          },
          changes: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              locationName: { type: 'string' },
              occurredAt: { type: 'string' },
              category: {
                type: 'string',
                enum: ['experience', 'habit', 'travel', 'food', 'growth', 'emotion'],
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 5,
              },
              description: { type: 'string' },
              aiSummary: { type: 'string' },
              replacementText: { type: 'string' },
            },
          },
        },
        required: ['targetReference', 'changes'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moment_delete_request',
      description: '请求删除一条 Moment。该工具只创建待确认操作，不直接删除。',
      parameters: {
        type: 'object',
        properties: {
          targetReference: {
            type: 'string',
            description: '用于定位目标 Moment 的标题、时间、地点或事件描述',
          },
        },
        required: ['targetReference'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'moment_clear_request',
      description: '请求删除全部 Moment。该工具只创建待确认操作，不直接清空。',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'config_get',
      description: '查询一刻当前功能配置。',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: ['instant_memory', 'all'],
          },
        },
        required: ['key'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'config_set',
      description: '修改一刻功能配置。目前只支持快速记录，即进入记录时先拍照并预览。',
      parameters: {
        type: 'object',
        properties: {
          key: {
            type: 'string',
            enum: ['instant_memory'],
          },
          value: { type: 'boolean' },
        },
        required: ['key', 'value'],
      },
    },
  },
];
