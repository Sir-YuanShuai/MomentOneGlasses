// 轻量 MCP Client：手写 JSON-RPC 2.0 over Streamable HTTP（非流式，不处理 SSE）。
//
// 范围（本阶段）：
// - initialize 握手 → notifications/initialized → tools/list（发现）→ tools/call（执行）
// - 认证复用 QR Binding token（binding.js）；401 时刷新后重试一次
// - 会话复用：同一 client 实例内共享 mcp-session-id；会话过期时重建后重试一次
// - 错误模型：网络 / HTTP / JSON-RPC / 工具级错误码（如 INVALID_ARGUMENTS）逐层透传
//
// 不引入 @modelcontextprotocol/sdk（控制 AIX 体积 ≤10MB）。
// 语法保持与现有 services 一致（QuickJS 兼容，无新依赖）。
import wx from 'wx';
import {
  MCP_ENDPOINT_URL,
  MCP_PROTOCOL_VERSION,
  MCP_REQUEST_TIMEOUT_MS
} from './config.js';
import { getValidAccessToken, tryRefresh } from './binding.js';

const MCP_CLIENT_NAME = 'moment-one-glasses';
const MCP_CLIENT_VERSION = '0.3.9';

// Streamable HTTP 请求头（与 Server SDK 要求一致，见 tests/api/test_mcp_server.py）
const DEFAULT_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': MCP_PROTOCOL_VERSION
};

// MCP 规范保留的 JSON-RPC 错误码（会话失效）
const RPC_SESSION_NOT_FOUND = -32001;

// 工具级错误码（与 docs/contracts/MCP_SERVER.md §7 对齐）在此作为普通
// MCP_TOOL_ERROR 的 code 透传，业务页面按需展示。
const TOOL_ERROR_CODE_PREFIXES = {
  INVALID_ARGUMENTS: true,
  SCOPE_DENIED: true,
  MOMENT_NOT_FOUND: true,
  IDEMPOTENCY_CONFLICT: true,
  AUTH_REQUIRED: true,
  TOKEN_INVALID: true,
  RATE_LIMITED: true,
  INTERNAL_ERROR: true
};

function createError(code, message, extra) {
  const error = new Error(message || code);
  error.code = code;
  if (extra) {
    Object.keys(extra).forEach((key) => {
      error[key] = extra[key];
    });
  }
  return error;
}

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      timeout: MCP_REQUEST_TIMEOUT_MS,
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

// 响应头查找（wx 可能返回不同大小写）
function headerValue(header, name) {
  if (!header) return '';
  if (header[name] !== undefined && header[name] !== null) return String(header[name]);
  const target = String(name).toLowerCase();
  const keys = Object.keys(header);
  for (let i = 0; i < keys.length; i += 1) {
    if (String(keys[i]).toLowerCase() === target) return String(header[keys[i]]);
  }
  return '';
}

/**
 * 创建一个 MCP Client 实例。
 *
 * 返回：
 * - listTools()                    → Promise<{ tools: [...] }>
 * - callTool(name, arguments)      → Promise<structuredContent>（工具级错误会 reject）
 * - getSessionId() / isInitialized() / reset()  → 会话调试与重建
 */
export function createMcpClient(options = {}) {
  const endpointUrl = options.endpointUrl || MCP_ENDPOINT_URL;
  let sessionId = '';
  let initialized = false;
  let nextRequestId = 1;

  function nextId() {
    const id = nextRequestId;
    nextRequestId += 1;
    return id;
  }

  function resetSession() {
    sessionId = '';
    initialized = false;
  }

  function isSessionExpired(error) {
    if (!error) return false;
    if (error.code === 'MCP_RPC_ERROR' && error.rpcCode === RPC_SESSION_NOT_FOUND) return true;
    // SDK 对失效会话返回 404 + "Invalid or expired session ID"
    if (error.code === 'MCP_HTTP_ERROR' && error.statusCode === 404 && sessionId) return true;
    return false;
  }

  // 发送一次 JSON-RPC 请求；认证 + 401 刷新重试在此统一处理。
  async function postJson(payload, useSession) {
    const token = await getValidAccessToken();
    if (!token) {
      throw createError('MCP_AUTH_REQUIRED', '设备未绑定或登录已失效，请重新扫码绑定账号');
    }

    function buildHeader(accessToken) {
      const header = Object.assign({}, DEFAULT_HEADERS, {
        authorization: `Bearer ${accessToken}`
      });
      if (useSession && sessionId) header['mcp-session-id'] = sessionId;
      return header;
    }

    async function attempt(accessToken) {
      try {
        return await request({
          url: endpointUrl,
          method: 'POST',
          data: payload,
          header: buildHeader(accessToken),
          dataType: 'json'
        });
      } catch (error) {
        throw createError('MCP_NETWORK_ERROR', 'MCP 服务请求失败，请检查网络后重试', {
          errMsg: error && error.errMsg ? error.errMsg : ''
        });
      }
    }

    let res = await attempt(token);

    if (res.statusCode === 401) {
      // access_token 失效 → 刷新后重试一次（refresh_token 30 天硬上限不滚动）
      const refreshed = await tryRefresh();
      const newToken = refreshed ? await getValidAccessToken() : null;
      if (!newToken) {
        throw createError('MCP_AUTH_REQUIRED', '登录状态已失效，请重新扫码绑定账号', {
          statusCode: 401
        });
      }
      res = await attempt(newToken);
    }

    if (res.statusCode !== 200 && res.statusCode !== 202) {
      throw createError('MCP_HTTP_ERROR', `MCP 端点返回 HTTP ${res.statusCode}`, {
        statusCode: res.statusCode
      });
    }
    return res;
  }

  // 解析 JSON-RPC 响应（Streamable HTTP 可能返回单对象或数组）
  function parseRpcResult(res) {
    const body = res && res.data;
    const messages = Array.isArray(body) ? body : body ? [body] : [];
    let message = null;
    for (let i = 0; i < messages.length; i += 1) {
      const candidate = messages[i];
      if (candidate && typeof candidate === 'object' && candidate.jsonrpc === '2.0') {
        message = candidate;
        break;
      }
    }
    if (!message) {
      throw createError('MCP_RPC_ERROR', 'MCP 响应格式无效', { statusCode: res.statusCode });
    }
    if (message.error) {
      throw createError('MCP_RPC_ERROR', String(message.error.message || 'JSON-RPC 错误'), {
        rpcCode: message.error.code,
        rpcData: message.error.data
      });
    }
    return message.result;
  }

  async function initialize() {
    const res = await postJson({
      jsonrpc: '2.0',
      id: nextId(),
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: MCP_CLIENT_NAME, version: MCP_CLIENT_VERSION }
      }
    }, false);
    const result = parseRpcResult(res);
    const sid = headerValue(res.header, 'mcp-session-id');
    if (!sid) {
      throw createError('MCP_SESSION_ERROR', 'MCP 端点未返回会话标识');
    }
    sessionId = sid;
    initialized = true;
    return result;
  }

  async function notifyInitialized() {
    await postJson({ jsonrpc: '2.0', method: 'notifications/initialized' }, true);
  }

  async function ensureSession() {
    if (initialized && sessionId) return;
    await initialize();
    await notifyInitialized();
  }

  async function rpcCall(method, params) {
    const res = await postJson({
      jsonrpc: '2.0',
      id: nextId(),
      method,
      params: params || {}
    }, true);
    return parseRpcResult(res);
  }

  // 会话内调用；会话过期时重建并重试一次。
  async function withSession(method, params) {
    await ensureSession();
    try {
      return await rpcCall(method, params);
    } catch (error) {
      if (isSessionExpired(error)) {
        resetSession();
        await ensureSession();
        return rpcCall(method, params);
      }
      throw error;
    }
  }

  // 工具结果：isError=true 时把错误信息抛为带 code 的错误。
  // 错误可能来自两处：
  // - 领域/业务层（err_result）：structuredContent.error = { code, message, details }
  // - SDK 参数校验层：isError=true 但只有文本 content（无 structuredContent）
  function extractToolError(result) {
    const structured = result.structuredContent && result.structuredContent.error;
    if (structured && structured.code) {
      return {
        code: String(structured.code),
        message: String(structured.message || '工具执行失败'),
        details: structured.details || {}
      };
    }
    const content = Array.isArray(result.content) ? result.content : [];
    const text = content.map((item) => item && item.text ? String(item.text) : '').join('\n');
    if (/validation error|Input should be|unexpected value/i.test(text)) {
      return { code: 'INVALID_ARGUMENTS', message: '参数校验失败，请检查工具参数', details: {} };
    }
    const firstLine = String(text).split('\n')[0] || '';
    return { code: 'MCP_TOOL_ERROR', message: firstLine.slice(0, 120) || '工具执行失败', details: {} };
  }

  function assertToolResult(result) {
    if (result && result.isError === true) {
      const info = extractToolError(result);
      const error = createError(
        TOOL_ERROR_CODE_PREFIXES[info.code] ? info.code : 'MCP_TOOL_ERROR',
        info.message,
        {
          toolCode: info.code,
          details: info.details || {}
        }
      );
      throw error;
    }
    return result && result.structuredContent !== undefined ? result.structuredContent : result;
  }

  return {
    listTools() {
      return withSession('tools/list', {}).then((result) => ({
        tools: result && Array.isArray(result.tools) ? result.tools : []
      }));
    },

    callTool(name, arguments_) {
      return withSession('tools/call', { name, arguments: arguments_ || {} }).then(assertToolResult);
    },

    getSessionId() {
      return sessionId;
    },

    isInitialized() {
      return initialized;
    },

    reset() {
      resetSession();
    }
  };
}

// 错误码 → 用户可读文案（供卡片/详情页/入口共用）
export function describeMcpError(error) {
  const code = error && error.code;
  if (code === 'MCP_AUTH_REQUIRED') return '登录状态已失效，请重新扫码绑定账号';
  if (code === 'MCP_NETWORK_ERROR') return '网络不可用，请稍后重试';
  if (code === 'SCOPE_DENIED') return '当前账号缺少记账权限，请在 Web 端设备管理中开启';
  if (code === 'INVALID_ARGUMENTS') return '记账参数无效，请检查后重试';
  if (code === 'MOMENT_NOT_FOUND') return '没有找到这条记账记录';
  if (code === 'IDEMPOTENCY_CONFLICT') return '重复的幂等键，未重复记账';
  if (code === 'MCP_HTTP_ERROR') return '记账服务响应异常，请稍后重试';
  if (code === 'MCP_SESSION_ERROR') return '记账会话建立失败，请重试';
  return (error && error.message) || '记账服务暂时不可用';
}
