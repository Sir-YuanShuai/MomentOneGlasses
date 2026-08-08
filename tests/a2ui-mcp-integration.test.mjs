import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { runAgentTurn } from '../services/agent-loop.js';
import { adaptToolResultA2ui, A2UI_BASIC_CATALOG_ID, A2UI_MIME_TYPE } from '../services/a2ui-adapter.js';
import { __redirectUrl, __seedStorage } from '../dev/mcp-verify/wx-shim.mjs';

const calls = [];
const a2uiFixture = [
  { version: 'v0.9.1', createSurface: { surfaceId: 'demo', catalogId: A2UI_BASIC_CATALOG_ID } },
  { version: 'v0.9.1', updateDataModel: { surfaceId: 'demo', path: '/', value: { title: '习惯进度', value: '3 / 5' } } },
  { version: 'v0.9.1', updateComponents: { surfaceId: 'demo', components: [
    { id: 'root', component: 'Column', children: ['title', 'value'] },
    { id: 'title', component: 'Text', text: { path: '/title' } },
    { id: 'value', component: 'Text', text: { path: '/value' } },
  ] } },
];

const server = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const rpc = body ? JSON.parse(body) : {};
  calls.push(rpc);
  response.setHeader('content-type', 'application/json');
  response.setHeader('mcp-session-id', 'a2ui-test-session');
  if (rpc.method === 'notifications/initialized') {
    response.statusCode = 202;
    response.end('');
    return;
  }
  let result = {};
  if (rpc.method === 'initialize') {
    result = { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 'test', version: '1' } };
  } else if (rpc.method === 'tools/list') {
    result = { tools: [
      { name: 'agent_plan', description: 'route', inputSchema: { type: 'object' } },
      { name: 'habit_progress', description: 'progress', inputSchema: { type: 'object' } },
    ] };
  } else if (rpc.method === 'tools/call' && rpc.params.name === 'agent_plan') {
    result = { content: [{ type: 'text', text: 'route' }], structuredContent: { toolName: 'habit_progress', arguments: {} } };
  } else if (rpc.method === 'tools/call' && rpc.params.name === 'habit_progress') {
    result = {
      content: [
        { type: 'text', text: '本周已完成 3 次，共 5 次目标。' },
        { type: 'resource', resource: { uri: 'a2ui://moment-one/habit-progress', mimeType: A2UI_MIME_TYPE, text: JSON.stringify(a2uiFixture) } },
      ],
      structuredContent: { completed: 3, target: 5 },
    };
  }
  response.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
__redirectUrl('https://moment-one-api.yuanshuai.fun', `http://127.0.0.1:${port}`);
const now = Math.floor(Date.now() / 1000);
__seedStorage({ accessToken: 'test-token', refreshToken: 'refresh', bindingId: 'binding', deviceId: 'device', accessTokenExpiresAt: now + 3600, refreshTokenExpiresAt: now + 86400 });

try {
  const turn = await runAgentTurn({ utterance: '查看我的习惯进度' });
  assert.equal(turn.intent.toolName, 'habit_progress');
  assert.deepEqual(turn.intent.result, { completed: 3, target: 5 });
  const presentation = adaptToolResultA2ui(turn.intent.toolResult);
  assert.equal(presentation.fallbackText, '本周已完成 3 次，共 5 次目标。');
  assert.equal(JSON.parse(presentation.commands)[0].type, 'createSurface');
  const initialize = calls.find((call) => call.method === 'initialize');
  assert.ok(initialize.params.capabilities.experimental.a2ui);
  assert.ok(initialize.params.capabilities.extensions['org.a2ui']);
  assert.deepEqual(calls.filter((call) => call.method === 'tools/call').map((call) => call.params.name), ['agent_plan', 'habit_progress']);
  console.log('A2UI over MCP Gate C integration checks passed.');
} finally {
  server.close();
}
