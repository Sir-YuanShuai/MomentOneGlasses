import { Readable } from 'node:stream';

const SUPPORTED_API_STYLE = 'openai-chat-completions';

function parseHeaders(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, headerValue]) => [String(key), String(headerValue)])
    );
  }

  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('必须是 JSON 对象');
    }
    return Object.fromEntries(
      Object.entries(parsed).map(([key, headerValue]) => [String(key), String(headerValue)])
    );
  } catch (error) {
    throw new Error(`AIUI_LLM_HEADERS 不是合法 JSON 对象：${error.message}`);
  }
}

function normalizeConfig(input = {}) {
  const config = {
    endpoint: String(input.endpoint || '').trim(),
    apiKey: String(input.apiKey || '').trim(),
    model: String(input.model || '').trim(),
    apiStyle: String(input.apiStyle || SUPPORTED_API_STYLE).trim(),
    headers: parseHeaders(input.headers),
    authHeader: String(input.authHeader || 'Authorization').trim(),
    authScheme: String(input.authScheme ?? 'Bearer').trim()
  };
  config.enabled = Boolean(config.endpoint && config.model);
  return config;
}

function validateConfig(config) {
  if (!config.endpoint && !config.model) return;
  if (!config.endpoint) throw new Error('.env.local 缺少 AIUI_LLM_ENDPOINT');
  if (!config.model) throw new Error('.env.local 缺少 AIUI_LLM_MODEL');

  let endpoint;
  try {
    endpoint = new URL(config.endpoint);
  } catch {
    throw new Error('AIUI_LLM_ENDPOINT 不是合法 URL');
  }

  if (!['http:', 'https:'].includes(endpoint.protocol)) {
    throw new Error('AIUI_LLM_ENDPOINT 只支持 http 或 https');
  }

  if (config.apiStyle !== SUPPORTED_API_STYLE) {
    throw new Error(`当前 Ink Runtime 只验证了 ${SUPPORTED_API_STYLE}`);
  }
}

function publicConfig(config) {
  let endpointDisplay = '';
  if (config.endpoint) {
    const endpoint = new URL(config.endpoint);
    endpointDisplay = `${endpoint.origin}${endpoint.pathname}`;
  }

  return {
    enabled: config.enabled,
    endpoint: endpointDisplay,
    model: config.model,
    apiStyle: config.apiStyle,
    apiKeyConfigured: Boolean(config.apiKey),
    headersConfigured: Object.keys(config.headers).length > 0,
    authHeader: config.authHeader,
    authScheme: config.authScheme,
    source: config.enabled ? '.env.local / environment' : 'disabled'
  };
}

async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function writeJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function buildUpstreamHeaders(config, requestHeaders = {}) {
  const headers = {
    'Content-Type': requestHeaders['content-type'] || 'application/json',
    Accept: requestHeaders.accept || 'text/event-stream, application/json',
    ...config.headers
  };

  if (config.apiKey && config.authHeader && headers[config.authHeader] == null) {
    headers[config.authHeader] = config.authScheme
      ? `${config.authScheme} ${config.apiKey}`
      : config.apiKey;
  }
  return headers;
}

function ensureRequestModel(body, config) {
  if (!body.byteLength) return body;
  try {
    const json = JSON.parse(body.toString('utf8'));
    if (!json.model) json.model = config.model;
    return Buffer.from(JSON.stringify(json));
  } catch {
    return body;
  }
}

async function requestUpstream(config, body, requestHeaders = {}) {
  if (!config.enabled) throw new Error('LLM 代理未配置');
  return fetch(config.endpoint, {
    method: 'POST',
    headers: buildUpstreamHeaders(config, requestHeaders),
    body: ensureRequestModel(body, config)
  });
}

async function testUpstream(config) {
  const body = Buffer.from(JSON.stringify({
    model: config.model,
    stream: true,
    messages: [
      {
        role: 'user',
        content: 'Reply with exactly: Moment One LLM proxy OK'
      }
    ],
    max_tokens: 32
  }));

  const startedAt = Date.now();
  const upstream = await requestUpstream(config, body, {
    'content-type': 'application/json',
    accept: 'text/event-stream, application/json'
  });
  const responseText = await upstream.text();

  return {
    ok: upstream.ok,
    status: upstream.status,
    durationMs: Date.now() - startedAt,
    contentType: upstream.headers.get('content-type') || '',
    preview: responseText.slice(0, 1200)
  };
}

export function createLlmProxyPlugin(inputConfig) {
  const config = normalizeConfig(inputConfig);
  validateConfig(config);

  return {
    name: 'moment-one-local-language-model-proxy',

    configureServer(server) {
      server.middlewares.use('/api/language-model', async (request, response) => {
        const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;

        if (pathname === '/config' && request.method === 'GET') {
          writeJson(response, 200, publicConfig(config));
          return;
        }

        if (pathname === '/test' && request.method === 'POST') {
          if (!config.enabled) {
            writeJson(response, 503, {
              error: {
                message: '请在 .env.local 配置 AIUI_LLM_ENDPOINT 和 AIUI_LLM_MODEL，然后重启 npm run dev'
              }
            });
            return;
          }

          try {
            writeJson(response, 200, await testUpstream(config));
          } catch (error) {
            writeJson(response, 502, { error: { message: error.message || String(error) } });
          }
          return;
        }

        if (pathname !== '/' || request.method !== 'POST') {
          writeJson(response, 405, { error: { message: 'Unsupported LanguageModel proxy route' } });
          return;
        }

        if (!config.enabled) {
          writeJson(response, 503, {
            error: {
              message: '请在 .env.local 配置真实 LanguageModel 代理并重启开发服务器'
            }
          });
          return;
        }

        try {
          const requestBody = await readRequestBody(request);
          const upstream = await requestUpstream(config, requestBody, request.headers);

          response.statusCode = upstream.status;
          const contentType = upstream.headers.get('content-type');
          const cacheControl = upstream.headers.get('cache-control');
          if (contentType) response.setHeader('Content-Type', contentType);
          if (cacheControl) response.setHeader('Cache-Control', cacheControl);
          response.setHeader('X-Moment-One-LLM-Model', config.model);

          if (!upstream.body) {
            response.end();
            return;
          }

          Readable.fromWeb(upstream.body).pipe(response);
        } catch (error) {
          console.error('[llm-proxy] request failed', error);
          if (!response.headersSent) {
            writeJson(response, 502, { error: { message: error.message || String(error) } });
          } else {
            response.destroy(error);
          }
        }
      });
    }
  };
}
