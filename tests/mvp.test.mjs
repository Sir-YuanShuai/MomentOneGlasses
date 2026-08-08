// Moment One Glasses MVP 回归测试（纯 MCP 记账客户端）。
// 覆盖：绑定核心（纯函数）、扫码解析、记账门槛、MCP 卡片数据契约、页面/配置一致性。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { looksLikeBookkeeping } from '../services/bookkeeping-gate.js';
import { createMcpSummaryCard, createAccountUnbindCard, createAccountUnbindResultCard } from '../services/card-presenter.js';
import { formatAmount, formatMoney, formatPeriodLabel } from '../services/format.js';
import {
  normalizeBindingCode,
  parseQrPayload,
  resolveTokenError,
} from '../services/binding-core.js';
import {
  extractSpokenBindingCode,
  findBindingCode,
  parseImageSize,
} from '../services/qr-scanner.js';
import { createDeviceId } from '../services/device-id.js';

function testBookkeepingGate() {
  const cases = [
    ['记一笔午餐28.5元', true],
    ['上个月花了多少钱', true],
    ['看看这个月的账单', true],
    ['支出多少', true],
    ['今天天气不错', false],
    ['帮我找找上周吃过的面馆', false],
    ['你好', false],
  ];
  cases.forEach(([utterance, expected]) => {
    assert.equal(
      looksLikeBookkeeping(utterance),
      expected,
      `bookkeeping gate for "${utterance}"`,
    );
  });
}

function testMcpCardContract() {
  const card = createMcpSummaryCard({
    summary: {
      period: 'month',
      year: 2026,
      month: 8,
      income: 1200,
      expense: 2318,
      balance: -1118,
      count: 6,
      byCategory: [
        { category: '餐饮', amount: 1200 },
        { category: '交通', amount: 600 },
        { category: '购物', amount: 518 },
      ],
    },
  });
  assert.equal(typeof card.data, 'object');
  assert.equal(card.data.status, 'ready');
  assert.equal(card.data.period, 'month');
  assert.equal(card.data.count, 6);
  assert.equal(card.data.topCategories.length, 3);
  assert.equal(card.data.topCategories[0].category, '餐饮');

  const errorCard = createMcpSummaryCard({ message: '服务不可用' });
  assert.equal(errorCard.data.status, 'error');
  assert.equal(errorCard.data.message, '服务不可用');
}

function testFormatHelpers() {
  assert.equal(formatAmount(1234.5), '1,234.50');
  assert.equal(formatAmount(0), '0.00');
  assert.equal(formatMoney(-1118), '-¥1,118.00');
  assert.equal(formatMoney(28.5), '+¥28.50');
  assert.equal(formatPeriodLabel('month'), '本月');
}

function testBindingParsing() {
  const code = 'A'.repeat(22);
  assert.equal(createAccountUnbindCard().route, 'pages/cards/account-unbind');
  assert.equal(createAccountUnbindCard().data.status, 'confirm');
  assert.equal(createAccountUnbindResultCard({ remoteRevoked: true }).data.status, 'success');
  assert.equal(normalizeBindingCode(code), code);
  assert.equal(parseQrPayload(`momentone://bind?code=${code}`), code);
  assert.equal(parseQrPayload(`momentone://bind?code=${encodeURIComponent(code)}`), code);
  assert.equal(parseQrPayload('https://example.com/?code=' + code), null);
  assert.equal(parseQrPayload('momentone://bind?code=too-short'), null);
  assert.equal(parseQrPayload(`momentone://bind?code=${code}&code=${code}`), null);
  assert.equal(extractSpokenBindingCode(`绑定码是 ${code}`), code);
  assert.equal(findBindingCode([{ rawValue: 'not-moment-one' }, { rawValue: `momentone://bind?code=${code}` }]), code);
  assert.equal(findBindingCode([{ rawValue: 'not-moment-one' }]), null);
  assert.equal(resolveTokenError({ error: { code: 'BINDING_CODE_EXPIRED' } }, 400), 'BINDING_CODE_EXPIRED');
  assert.equal(resolveTokenError({}, 503), 'SERVER_ERROR');

  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0, 0, 0, 0x03, 0, 0, 0, 0x02,
  ]);
  assert.deepEqual(parseImageSize(png), { width: 3, height: 2 });
}

function testAppConfig() {
  const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  assert.deepEqual(appConfig.pages, [
    'pages/index/index',
    'pages/cards/bookkeeping-card',
    'pages/scan/scan',
    'pages/cards/account-unbind',
    'pages/mcp/detail',
  ]);

  appConfig.pages.forEach((route) => {
    const pagePath = `${route}.ink`;
    assert.equal(
      fs.existsSync(pagePath),
      true,
      `app.json: 路由 ${route} 对应的 ${pagePath} 不存在`,
    );
  });
}

function testPagesVoiceFirst() {
  const inkPages = fs.readdirSync('pages', { recursive: true })
    .filter((file) => String(file).endsWith('.ink'));
  inkPages.forEach((file) => {
    // 交互式页面豁免（按钮/绑事件）：账号安全卡 + MCP 卡片与详情页 + 入口页内嵌卡片
    if (['cards/account-unbind.ink', 'cards/bookkeeping-card.ink', 'mcp/detail.ink', 'index/index.ink'].includes(String(file))) return;
    const pagePath = path.join('pages', String(file));
    const source = fs.readFileSync(pagePath, 'utf8');
    assert.equal(
      /<button|bindtap=/.test(source),
      false,
      `${pagePath} must be voice-first without buttons`,
    );
  });
}

function testBookkeepingCardPageTool() {
  const source = fs.readFileSync('pages/cards/bookkeeping-card.ink', 'utf8');
  assert.match(source, /utterance/, 'bookkeeping-card must accept the utterance page-tool argument');
  assert.match(source, /runAgentTurn/, 'bookkeeping-card must reuse the MCP pre-router');
  assert.match(source, /renderFromData/, 'bookkeeping-card must keep the legacy structured-data fallback');
  const defBlock = source.slice(source.indexOf('<script def>'), source.indexOf('</script>'));
  assert.doesNotMatch(defBlock, /"income"|"expense"|"count"/, 'page-tool schema must only forward utterance and must not invite host-fabricated data');
  assert.match(source, /expenseLabel: '--'/, 'bookkeeping-card must seed plain placeholder labels (no misleading 0)');
  assert.match(source, /<a2ui/, 'bookkeeping-card must provide the official AIUI A2UI renderer');
  assert.match(source, /adaptToolResultA2ui/, 'bookkeeping-card must adapt standard MCP A2UI resources');
  assert.match(source, /createA2UIContext/, 'bookkeeping-card must update an already-mounted A2UI surface via runtime context');
  assert.doesNotMatch(source.replace(/<script[\s\S]*?<\/script>/g, ''), /\{\{ summary\./, 'bookkeeping-card template must not use nested {{ summary.x }} bindings (host card container limitation)');
  assert.match(source, /card-version/, 'bookkeeping-card must always show the version line');
  assert.match(source, /@media \(target: _current\)/, 'bookkeeping-card must adapt to the conversation-flow card container');
  assert.match(source, /target: _current/, 'bookkeeping-card must track the host target');
}

function testIndexEntryRouting() {
  const source = fs.readFileSync('pages/index/index.ink', 'utf8');
  assert.match(source, /bindingGate/, 'index must own the first-entry binding gate');
  assert.match(source, /openScanPage/, 'index must open scan page from the binding gate');
  assert.match(source, /APP_VERSION/, 'index must display the unified app version');
  assert.match(source, /BUILD_ID/, 'index must display the packaged build id');
  assert.match(source, /runAgentTurn/, 'index must route utterances through the MCP pre-router');
  assert.match(source, /mcpCard/, 'index must keep the legacy MCP summary fallback');
  assert.match(source, /immersiveA2ui/, 'index must expose a generic immersive A2UI surface');
  assert.match(source, /adaptToolResultA2ui/, 'index must consume standard A2UI tool results');
  assert.match(source, /index-mcp-a2ui/, 'index must render A2UI with the official component');
  assert.match(source, /openMcpDetail/, 'index must open the full-screen detail from the embedded card');
  assert.doesNotMatch(source, /saveMoment/, 'index must not keep local moment storage code');
  assert.doesNotMatch(source, /memory-repository|memory-store|moment-ai/, 'index must not import local memory services');
  // 沉浸式入口不声明页面工具（官方规范：只有对话式页面声明 description/schema）
  const defBlock = source.slice(source.indexOf('<script def>'), source.indexOf('</script>'));
  assert.doesNotMatch(defBlock, /"schema"|"description"/, 'index (immersive entry) must not declare a page tool');
  // 新指令开始收起旧卡片，避免一直显示
  assert.match(source, /'mcpCard.visible': false/, 'index must dismiss the embedded card on a new turn');
}

function testScanPage() {
  const source = fs.readFileSync('pages/scan/scan.ink', 'utf8');
  assert.doesNotMatch(source, /from ['"]canvas['"]/, 'scan page must avoid unsupported canvas constructor loading');
  assert.match(source, /from ['"]barcode['"]/, 'scan page must use the official BarcodeDetector module');
  assert.match(source, /<camera class=/, 'scan page must render the official camera preview component');
  assert.match(source, /wx\.media\.createCameraContext/, 'scan page must connect CameraContext to the camera component');
  assert.match(source, /requestBinding/, 'scan page must call requestBinding');
  assert.match(source, /pages\/index\/index/, 'scan page must redirect to index after binding');
  assert.match(source, /SpeechRecognition/, 'scan page must support voice binding fallback');
  assert.match(source, /localMode/, 'scan page must support local mode skip');
}

function testBindingService() {
  assert.equal(fs.existsSync('services/config.js'), true, 'config.js must exist');
  assert.equal(fs.existsSync('services/binding.js'), true, 'binding.js must exist');
  assert.equal(fs.existsSync('services/build-info.js'), true, 'build info module must exist');

  const configSource = fs.readFileSync('services/config.js', 'utf8');
  assert.match(configSource, /SERVER_BASE_URL/, 'config must define SERVER_BASE_URL');
  assert.match(configSource, /OAUTH_TOKEN_URL/, 'config must define OAUTH_TOKEN_URL');
  assert.match(configSource, /STORAGE_KEYS/, 'config must define STORAGE_KEYS');
  assert.match(configSource, /DEVICE_BINDINGS_URL/, 'config must define the self-unbind endpoint');
  assert.match(configSource, /MCP_ENDPOINT_URL/, 'config must define the MCP endpoint');
  assert.match(configSource, /REFRESH_TOKEN_HARD_TTL_SECONDS/, 'config must enforce the refresh hard limit');

  const bindingSource = fs.readFileSync('services/binding.js', 'utf8');
  assert.match(bindingSource, /getDeviceId/, 'binding must export getDeviceId');
  assert.match(bindingSource, /getBindingStatus/, 'binding must export getBindingStatus');
  assert.match(bindingSource, /parseQrPayload/, 'binding must export parseQrPayload');
  assert.match(bindingSource, /requestBinding/, 'binding must export requestBinding');
  assert.match(bindingSource, /getValidAccessToken/, 'binding must export getValidAccessToken');
  assert.match(bindingSource, /clearBinding/, 'binding must export clearBinding');
  assert.match(bindingSource, /wx\.request/, 'binding must use wx.request for network calls');
  assert.match(bindingSource, /refreshTokenExpiresAt/, 'binding must preserve the hard refresh deadline');
  assert.doesNotMatch(bindingSource, /verifyTokenWithServer/, 'binding must not probe the Web management endpoint as validation');
}

function testMcpClientService() {
  const source = fs.readFileSync('services/mcp-client.js', 'utf8');
  assert.match(source, /createMcpClient/, 'mcp-client must export createMcpClient');
  assert.match(source, /listTools/, 'mcp-client must expose tools/list');
  assert.match(source, /callTool/, 'mcp-client must expose tools/call');
  assert.match(source, /callToolResult/, 'mcp-client must preserve full CallToolResult for embedded A2UI resources');
  assert.match(source, /MCP_CLIENT_CAPABILITIES/, 'mcp-client must advertise A2UI capabilities during initialize');
  assert.match(source, /listResources/, 'mcp-client must expose resources/list');
  assert.match(source, /readResource/, 'mcp-client must expose resources/read');
  assert.match(source, /listPrompts/, 'mcp-client must expose prompts/list');
  assert.match(source, /getPrompt/, 'mcp-client must expose prompts/get');
  assert.match(source, /401/, 'mcp-client must handle 401 refresh-retry');
  assert.doesNotMatch(source, /from ['"]@modelcontextprotocol/, 'mcp-client must be hand-written JSON-RPC (no SDK import)');
}

function testNoLocalMemoryCode() {
  ['services/memory-repository.js', 'services/memory-store.js', 'services/moment-ai.js', 'services/record-media.js', 'services/intent-router.js', 'prompts/tool-planner-v1.js'].forEach((file) => {
    assert.equal(fs.existsSync(file), false, `${file} must be removed (local memory feature dropped)`);
  });
  const agentLoop = fs.readFileSync('services/agent-loop.js', 'utf8');
  assert.doesNotMatch(agentLoop, /LanguageModel/, 'agent-loop must not depend on device LanguageModel');
  assert.match(agentLoop, /listTools/, 'agent-loop must discover remote MCP tools at runtime');
  assert.match(agentLoop, /agent_plan/, 'agent-loop must prefer the Server-side generic planner');
  assert.match(agentLoop, /toolNames\.includes\(toolName\)/, 'agent-loop must validate planned tools against discovery');
}

function testDeviceId() {
  const first = createDeviceId();
  const second = createDeviceId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first, second, 'device ids must be unique');
}

function testBuildInfo() {
  const packageVersion = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  const buildInfo = fs.readFileSync('services/build-info.js', 'utf8');
  assert.match(buildInfo, new RegExp(`APP_VERSION = ['\"]${packageVersion}['\"]`), 'development build info must match package.json version');
  const packScript = fs.readFileSync('scripts/pack-aix.mjs', 'utf8');
  assert.match(packScript, /services', 'build-info\.js/, 'packaging must write build info into the AIX staging area');
}

function testAppJsConfig() {
  const appSource = fs.readFileSync('app.js', 'utf8');
  assert.match(appSource, /version: '0\.3\.17'/);
  assert.match(appSource, /mcpEnabled:\s*true/);
  assert.match(appSource, /mcpAppsEnabled:\s*true/);
}

function testDocumentationLinks() {
  function collectMarkdown(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectMarkdown(target);
      return target.endsWith('.md') ? [target] : [];
    });
  }

  const files = ['README.md', 'AGENTS.md', ...collectMarkdown('docs')];
  files.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const target = match[1];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const localPath = decodeURIComponent(target.split('#')[0]);
      assert.equal(
        fs.existsSync(path.resolve(path.dirname(file), localPath)),
        true,
        `${file} has broken link ${target}`,
      );
    }
  });
}

testBookkeepingGate();
testMcpCardContract();
testFormatHelpers();
testBindingParsing();
testAppConfig();
testBookkeepingCardPageTool();
testPagesVoiceFirst();
testIndexEntryRouting();
testScanPage();
testBindingService();
testMcpClientService();
testNoLocalMemoryCode();
testDeviceId();
testBuildInfo();
testAppJsConfig();
testDocumentationLinks();
console.log('Local MVP regression checks passed.');
