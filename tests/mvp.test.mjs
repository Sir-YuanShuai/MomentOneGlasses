import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fallbackRecognizeIntent } from '../services/intent-router.js';
import { createMemoryRepository } from '../services/memory-repository.js';
import { resolveRecordMediaChoice, VIDEO_RECORDING_SUPPORTED } from '../services/record-media.js';
import { MOMENT_TOOL_DEFINITIONS } from '../services/tools/definitions.js';
import { resolveToolCall } from '../services/tools/registry.js';
import {
  extractSpokenBindingCode,
  findBindingCode,
  parseImageSize
} from '../services/qr-scanner.js';
import {
  normalizeBindingCode,
  parseQrPayload,
  resolveTokenError
} from '../services/binding-core.js';
import { decodeCameraImage } from '../services/image-decode.js';
import { decodeWebP } from '../services/webp.js';
import { decodeQrPixels } from '../services/qr-fallback.js';
import { createDeviceId } from '../services/device-id.js';

function memoryStorage() {
  const values = new Map();
  return {
    getStorageSync(key) {
      const value = values.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    setStorageSync(key, value) {
      values.set(key, structuredClone(value));
    },
    removeStorageSync(key) {
      values.delete(key);
    },
  };
}

function moment(id, occurredAt, fields = {}) {
  return {
    id,
    title: fields.title || id,
    occurredAt,
    voiceInput: fields.voiceInput || '',
    description: fields.description || '',
    aiSummary: fields.aiSummary || '',
    category: fields.category || 'experience',
    tags: fields.tags || [],
    location: fields.location || { name: '', source: 'unknown' },
    revision: fields.revision ?? 0,
    syncState: fields.syncState || 'pending',
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

function testIntentFallback() {
  const cases = [
    ['记录今天第一次看海', 'moment.create'],
    ['帮我记一下今天见了小王', 'moment.create'],
    ['我上周去过哪里', 'moment.query'],
    ['我有多少条记录', 'moment.query'],
    ['把上一条地点改成西湖', 'moment.update'],
    ['删除面馆记录', 'moment.delete'],
    ['清空全部记忆', 'moment.clear'],
    ['关闭即刻记忆', 'config.set'],
    ['开启快速记录', 'config.set'],
    ['即刻记忆现在开着吗', 'config.get'],
    ['你好', 'help'],
    ['今天天气不错', 'moment.create'],
    ['刚在西湖边散步，阳光很好', 'moment.create'],
    ['这家面很好吃', 'moment.create'],
    ['今天窗外正在下雨，雨声很安静', 'moment.create'],
  ];

  cases.forEach(([utterance, expectedType]) => {
    const intent = fallbackRecognizeIntent(utterance);
    assert.equal(intent.type, expectedType, `intent for "${utterance}"`);
  });
}

function testRecordMediaChoices() {
  assert.equal(resolveRecordMediaChoice('保存照片'), 'photo');
  assert.equal(resolveRecordMediaChoice('重新拍一张'), 'retake');
  assert.equal(resolveRecordMediaChoice('不保存照片'), 'text');
  assert.equal(resolveRecordMediaChoice('录一段音频'), 'audio');
  assert.equal(resolveRecordMediaChoice('照片和录音都保存'), 'photo+audio');
  assert.equal(resolveRecordMediaChoice('录制视频'), 'video');
  assert.equal(resolveRecordMediaChoice('取消'), 'cancel');
  assert.equal(resolveRecordMediaChoice('随便'), 'unknown');
  assert.equal(VIDEO_RECORDING_SUPPORTED, false);
}

function testToolDefinitions() {
  assert.ok(Array.isArray(MOMENT_TOOL_DEFINITIONS));
  assert.ok(MOMENT_TOOL_DEFINITIONS.length >= 4, 'must define at least 4 moment tools');
  const names = MOMENT_TOOL_DEFINITIONS.map((tool) => tool.function.name);
  ['moment_create', 'moment_search', 'moment_update', 'moment_delete_request'].forEach((required) => {
    assert.ok(names.includes(required), `tool ${required} must be defined`);
  });
  MOMENT_TOOL_DEFINITIONS.forEach((tool) => {
    assert.equal(tool.type, 'function');
    assert.ok(tool.function.name, 'tool must have a name');
    assert.ok(tool.function.parameters, 'tool must have parameters');
  });
}

function testToolPolicy() {
  const create = resolveToolCall({ name: 'moment_create', arguments: { content: '今天看了海' } }, '今天看了海');
  assert.equal(create.ok, true);
  assert.equal(create.intent.type, 'moment.create');

  const search = resolveToolCall({ name: 'moment_search', arguments: { query: '上周吃什么', mode: 'search' } }, '上周吃什么');
  assert.equal(search.ok, true);
  assert.equal(search.intent.type, 'moment.query');

  const update = resolveToolCall(
    { name: 'moment_update', arguments: { targetReference: '上一条', changes: { title: '新标题' } } },
    '把上一条标题改一下',
  );
  assert.equal(update.ok, true);

  const unknown = resolveToolCall({ name: 'unknown_tool', arguments: {} }, 'test');
  assert.equal(unknown.ok, false);

  const emptyCreate = resolveToolCall({ name: 'moment_create', arguments: { content: '' } }, '记录');
  assert.equal(emptyCreate.ok, false);
}

function testMemoryRepository() {
  const storage = memoryStorage();
  const repository = createMemoryRepository({ storage, storageKey: 'test:moments', maxMoments: 50 });

  const initial = repository.listMoments();
  assert.equal(initial.length, 0);

  const saved = repository.saveMoment(moment('m1', '2026-08-01T10:00:00+08:00', { title: '看海' }));
  assert.equal(saved.id, 'm1');
  assert.equal(saved.title, '看海');
  assert.equal(repository.listMoments().length, 1);

  const found = repository.searchMoments('海');
  assert.equal(found.length, 1);
  assert.equal(found[0].title, '看海');

  const updated = repository.updateMoment('m1', { title: '第一次看海' });
  assert.equal(updated.title, '第一次看海');
  assert.equal(updated.revision, 1);

  repository.deleteMoment('m1');
  assert.equal(repository.listMoments().length, 0);
}

function testAppConfig() {
  const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  assert.deepEqual(appConfig.pages, [
    'pages/index/index',
    'pages/scan/scan',
    'pages/cards/moment-result',
    'pages/cards/memory-answer',
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
    const pagePath = path.join('pages', String(file));
    const source = fs.readFileSync(pagePath, 'utf8');
    assert.equal(
      /<button|bindtap=/.test(source),
      false,
      `${pagePath} must be voice-first without buttons`,
    );
  });
}

function testIndexEntryRouting() {
  const source = fs.readFileSync('pages/index/index.ink', 'utf8');
  assert.match(source, /bindingGate/, 'index must own the first-entry binding gate');
  assert.match(source, /openScanPage/, 'index must open scan page from the binding gate');
  assert.match(source, /APP_VERSION/, 'index must display the unified app version');
  assert.match(source, /BUILD_ID/, 'index must display the packaged build id');
  assert.doesNotMatch(source, /pages\/welcome\/welcome/, 'index must not redirect through the removed welcome page');
}

function testScanPage() {
  const source = fs.readFileSync('pages/scan/scan.ink', 'utf8');
  assert.doesNotMatch(source, /from ['"]canvas['"]/, 'scan page must avoid unsupported canvas constructor loading');
  assert.match(source, /from ['"]barcode['"]/, 'scan page must use the official BarcodeDetector module');
  assert.match(source, /<camera class=/, 'scan page must render the official camera preview component');
  assert.match(source, /wx\.media\.createCameraContext/, 'scan page must connect CameraContext to the camera component');
  assert.match(source, /decodeWebP/, 'scan page must decode real-device WebP captures');
  assert.match(source, /decodeQrPixels/, 'scan page must retain the Craft RGBA QR fallback');
  assert.match(source, /onReady/, 'scan page must initialize camera after page readiness');
  assert.match(source, /onShow/, 'scan page must recreate camera context when shown');
  assert.match(source, /findBindingCode/, 'scan page must parse QR detections');
  assert.match(source, /requestBinding/, 'scan page must call requestBinding');
  assert.match(source, /QR content/, 'scan page must print detected QR content before validation');
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
  assert.match(bindingSource, /token bundle persisted/, 'binding must read back the persisted token bundle');
  assert.doesNotMatch(bindingSource, /verifyTokenWithServer/, 'binding must not probe the Web management endpoint as validation');
}


function testDeviceId() {
  const first = createDeviceId();
  const second = createDeviceId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.notEqual(first, second, 'device ids must be unique');
}

function testBindingParsing() {
  const code = 'A'.repeat(22);
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
    0, 0, 0, 0x03, 0, 0, 0, 0x02
  ]);
  assert.deepEqual(parseImageSize(png), { width: 3, height: 2 });
  const fixture = fs.readFileSync('dev/fixtures/mock-binding-qr.png');
  const decoded = decodeCameraImage(fixture, 'image/png');
  assert.deepEqual({ width: decoded.width, height: decoded.height }, { width: 320, height: 320 });
  assert.equal(decoded.data.byteLength, 320 * 320 * 4, 'decoded image must be RGBA pixels for BarcodeDetector');
  assert.equal(decodeQrPixels(decoded.data, decoded.width, decoded.height), 'momentone://bind?code=MockBindingCode_1234567');
}

async function testWebPDecoder() {
  const fixture = fs.readFileSync('dev/fixtures/mock-binding-qr.webp');
  const decoded = await decodeWebP(fixture, { output: 'rgba' });
  assert.equal(decoded.width, 320);
  assert.equal(decoded.height, 320);
  assert.equal(decoded.rgba.byteLength, 320 * 320 * 4);
  assert.equal(
    decodeQrPixels(decoded.rgba, decoded.width, decoded.height),
    'momentone://bind?code=MockBindingCode_1234567',
    'official WebP decoder output must remain readable by the bundled QR fallback'
  );
}

function testIndexPage() {
  const source = fs.readFileSync('pages/index/index.ink', 'utf8');
  assert.match(source, /SpeechRecognition/, 'index page must use SpeechRecognition');
  assert.match(source, /runAgentTurn/, 'index page must run agent loop');
  assert.match(source, /saveMoment/, 'index page must save moments');
  assert.match(source, /searchMoments/, 'index page must search moments');
  assert.match(source, /getValidAccessToken/, 'index page must validate binding token');
  // 未绑定时由 index 自己显示绑定门，不再经过 welcome
  assert.match(source, /bindingGate/, 'index must show binding gate when unbound');
  assert.match(source, /suppressAutomaticEntry/, 'index must not auto-capture immediately after binding');
  assert.doesNotMatch(source, /pages\/welcome\/welcome/, 'index must not reference removed welcome page');
  // 支持本地模式跳过绑定
  assert.match(source, /localMode/, 'index page must support localMode parameter');
}

function testConversationServices() {
  const required = [
    'services/agent-loop.js',
    'services/agent-trace.js',
    'services/intent-router.js',
    'services/moment-ai.js',
    'services/memory-repository.js',
    'services/memory-store.js',
    'services/card-presenter.js',
    'services/format.js',
    'services/record-media.js',
    'services/tools/definitions.js',
    'services/tools/registry.js',
  ];
  required.forEach((file) => {
    assert.equal(fs.existsSync(file), true, `${file} must exist for conversation flow`);
  });

  const promptsDir = 'prompts';
  assert.equal(fs.existsSync(promptsDir), true, 'prompts/ directory must exist');
  assert.equal(fs.existsSync('prompts/moment-understanding-v1.js'), true, 'moment-understanding-v1 prompt must exist');
  assert.equal(fs.existsSync('prompts/tool-planner-v1.js'), true, 'tool-planner-v1 prompt must exist');
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
  assert.match(appSource, /repositoryMode:\s*'local'/);
  assert.match(appSource, /cloudSyncEnabled:\s*false/);
  assert.match(appSource, /mcpEnabled:\s*false/);
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

testIntentFallback();
testRecordMediaChoices();
testToolDefinitions();
testToolPolicy();
testMemoryRepository();
testAppConfig();
testPagesVoiceFirst();
testIndexEntryRouting();
testScanPage();
testBindingService();
testDeviceId();
testBindingParsing();
await testWebPDecoder();
testIndexPage();
testConversationServices();
testBuildInfo();
testAppJsConfig();
testDocumentationLinks();
console.log('Local MVP regression checks passed.');
