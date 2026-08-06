// MCP 工具动态声明 + 远程提示词加载（工具与提示词均由远程 Server 提供）。
//
// - toLanguageModelTools(): tools/list 原始结果 → LanguageModel 工具定义格式
//   （{ type:'function', function:{ name, description, parameters } }），
//   供 agent-loop 动态合并，让 LLM 自行决定参数（周期/月份等）；
// - loadMcpToolDefinitions() / loadMcpPrompt(): 独立加载（自带 client，用于
//   验证与页面兜底）；agent-loop 内推荐自建 client 复用会话执行。
//
// 失败一律降级为空（不阻塞本地能力）；真正的执行走 mcp-client.callTool。
import { createMcpClient } from './mcp-client.js';

// tools/list 的 MCP inputSchema → LanguageModel parameters（兼容缺省字段）
export function toLanguageModelTools(mcpTools) {
  const tools = Array.isArray(mcpTools) ? mcpTools : [];
  return tools.map((tool) => {
    const schema = tool && tool.inputSchema && typeof tool.inputSchema === 'object'
      ? tool.inputSchema
      : {};
    const parameters = {
      type: 'object',
      properties: (schema.properties && typeof schema.properties === 'object')
        ? schema.properties
        : {},
    };
    if (Array.isArray(schema.required) && schema.required.length) {
      parameters.required = schema.required;
    }
    return {
      type: 'function',
      function: {
        name: String(tool.name || ''),
        description: String((tool && tool.description) || (tool && tool.name) || ''),
        parameters,
      },
    };
  }).filter((tool) => tool.function.name);
}

// 独立加载：MCP 工具定义（LanguageModel 格式），失败返回 []
export async function loadMcpToolDefinitions(options) {
  try {
    const client = createMcpClient(options || {});
    const result = await client.listTools();
    const definitions = toLanguageModelTools(result.tools);
    client.reset();
    return definitions;
  } catch (error) {
    console.warn('[moment-one:mcp] tool discovery failed, degraded to local only', error);
    return [];
  }
}

// 独立加载：远程提示词文本（如 bookkeeping-assistant），失败返回 ''
export async function loadMcpPrompt(name, options) {
  try {
    const client = createMcpClient(options || {});
    const result = await client.getPrompt(String(name || 'bookkeeping-assistant'));
    client.reset();
    return result.text || '';
  } catch (error) {
    console.warn(`[moment-one:mcp] prompt "${name}" load failed`, error);
    return '';
  }
}

// MCP 工具名集合判断（agent-loop 决定 toolcall 是否走远程执行）
export function isMcpToolName(name, mcpToolNames) {
  return Array.isArray(mcpToolNames) && mcpToolNames.indexOf(String(name || '')) !== -1;
}
