// wx 模块的 Node 验证替身（仅用于 dev/mcp-verify 端到端验证）。
// 实现 services/ 使用的 wx 子集：request / 同步存储。
// 额外提供测试注入点：__seedStorage / __setRefreshHandler / __injectOnce。

const storage = new Map();
const refreshHandler = { fn: null };
const injectOnce = { items: [] };
const requestLog = [];
const urlRedirects = [];

// 测试注入：把匹配的请求 URL 重写（如生产 MCP 端点 → standalone）
export function __redirectUrl(from, to) {
  urlRedirects.push({ from, to });
}

export function __clearRedirects() {
  urlRedirects.length = 0;
}

function rewriteUrl(url) {
  let result = url;
  for (let i = 0; i < urlRedirects.length; i += 1) {
    const redirect = urlRedirects[i];
    if (result.startsWith(redirect.from)) {
      result = redirect.to + result.slice(redirect.from.length);
      break;
    }
  }
  return result;
}

function doRequest(options) {
  return new Promise((resolve, reject) => {
    runRequest(options).then(resolve, (error) => {
      if (options.fail) options.fail({ errMsg: error && error.message ? error.message : 'network error' });
      if (options.complete) options.complete({ errMsg: error && error.message ? error.message : 'network error' });
      reject(error);
    });
  });
}

async function runRequest(options) {
  const url = rewriteUrl(String(options.url || ''));
  const method = String(options.method || 'GET').toUpperCase();
  const header = options.header || {};
  const contentType = header['content-type'] || header['Content-Type'] || '';
  const isJson = /application\/json/.test(contentType);

  // 1) 注入的一次性响应（会话过期等故障注入）
  for (let i = 0; i < injectOnce.items.length; i += 1) {
    const item = injectOnce.items[i];
    if (item.match({ url, method, data: options.data })) {
      injectOnce.items.splice(i, 1);
      requestLog.push({ url, method, statusCode: item.response.statusCode, injected: true });
      if (options.success) {
        options.success({ statusCode: item.response.statusCode, data: item.response.data, header: item.response.header || {}, errMsg: 'ok' });
      }
      return;
    }
  }

  // 2) 注入的 refresh 端点响应（401 → 刷新链路，不打真实网络）
  if (refreshHandler.fn && /\/oauth\/token$/.test(url)) {
    const injected = refreshHandler.fn({ url, method, data: options.data });
    if (injected) {
      requestLog.push({ url, method, statusCode: injected.statusCode, injected: true });
      if (options.success) {
        options.success({ statusCode: injected.statusCode, data: injected.data, header: injected.header || {}, errMsg: 'ok' });
      }
      return;
    }
  }

  // 3) 真实 HTTP（Node fetch）
  const body = isJson && options.data !== undefined && options.data !== null
    ? JSON.stringify(options.data)
    : (typeof options.data === 'string' ? options.data : undefined);
  const headers = {};
  Object.keys(header).forEach((key) => { headers[key] = String(header[key]); });
  if (!headers['content-type'] && body !== undefined) headers['content-type'] = isJson ? 'application/json' : 'application/x-www-form-urlencoded';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: method === 'GET' ? undefined : body,
      signal: AbortSignal.timeout(options.timeout || 20000)
    });
  } catch (error) {
    throw new Error(error && error.message ? error.message : 'network error');
  }

  const text = await response.text();
  let parsed = text;
  if (options.dataType === 'json' || /json/.test(response.headers.get('content-type') || '')) {
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  }
  const responseHeaders = {};
  response.headers.forEach((value, key) => { responseHeaders[key] = value; });
  requestLog.push({ url, method, statusCode: response.status, injected: false });
  if (options.success) {
    options.success({ statusCode: response.status, data: parsed, header: responseHeaders, errMsg: 'ok' });
  }
}

const wxShim = {
  request(options) {
    doRequest(options);
    return {
      abort() {},
      onHeadersReceived() {},
      offHeadersReceived() {},
      onChunkReceived() {},
      offChunkReceived() {}
    };
  },

  getStorageSync(key) {
    return storage.has(key) ? storage.get(key) : undefined;
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  },
  removeStorageSync(key) {
    storage.delete(key);
  },
  clearStorageSync() {
    storage.clear();
  },
  getStorage(options) {
    if (storage.has(options.key)) {
      if (options.success) options.success({ data: storage.get(options.key) });
    } else if (options.fail) {
      options.fail({ errMsg: 'Key not found' });
    }
  },
  setStorage(options) {
    storage.set(options.key, options.data);
    if (options.success) options.success({});
  },
  removeStorage(options) {
    storage.delete(options.key);
    if (options.success) options.success({});
  },
  navigateTo() {},
  redirectTo() {},
  navigateBack() {}
};

export default wxShim;

// ---- 测试注入 API ----

export function __seedStorage(entries) {
  Object.keys(entries).forEach((key) => storage.set(key, entries[key]));
}

export function __getStorage() {
  const result = {};
  storage.forEach((value, key) => { result[key] = value; });
  return result;
}

export function __setRefreshHandler(fn) {
  refreshHandler.fn = fn || null;
}

export function __injectOnce(match, response) {
  injectOnce.items.push({ match, response });
}

export function __clearInjections() {
  injectOnce.items.length = 0;
}

export function __requestLog() {
  return requestLog.slice();
}

export function __clearRequestLog() {
  requestLog.length = 0;
}
