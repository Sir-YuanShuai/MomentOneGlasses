import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fallbackRecognizeIntent } from '../services/intent-router.js';
import { createMemoryRepository } from '../services/memory-repository.js';
import { resolveRecordMediaChoice, VIDEO_RECORDING_SUPPORTED } from '../services/record-media.js';
import { MOMENT_TOOL_DEFINITIONS } from '../services/tools/definitions.js';
import { resolveToolCall } from '../services/tools/registry.js';

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
    'pages/welcome/welcome',
    'pages/scan/scan',
    'pages/index/index',
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

function testWelcomeRouting() {
  const source = fs.readFileSync('pages/welcome/welcome.ink', 'utf8');
  assert.match(source, /getBindingStatus/, 'welcome must call getBindingStatus');
  assert.match(source, /pages\/scan\/scan/, 'welcome must route to scan page when unbound');
  assert.match(source, /pages\/index\/index/, 'welcome must route to index page when bound');
}

function testScanPage() {
  const source = fs.readFileSync('pages/scan/scan.ink', 'utf8');
  assert.match(source, /BarcodeDetector/, 'scan page must reference BarcodeDetector');
  assert.match(source, /parseQrPayload/, 'scan page must parse QR payload');
  assert.match(source, /requestBinding/, 'scan page must call requestBinding');
  assert.match(source, /pages\/index\/index/, 'scan page must redirect to index after binding');
  // 语音绑定模式（设备不支持扫码时的替代方案）
  assert.match(source, /SpeechRecognition/, 'scan page must support voice binding fallback');
  // 本地模式跳过（连按 2 次返回键）
  assert.match(source, /localMode/, 'scan page must support local mode skip');
  // 返回键应回到 welcome（避免卡死）
  assert.match(source, /pages\/welcome\/welcome/, 'scan page back must go to welcome');
}

function testBindingService() {
  assert.equal(fs.existsSync('services/config.js'), true, 'config.js must exist');
  assert.equal(fs.existsSync('services/binding.js'), true, 'binding.js must exist');

  const configSource = fs.readFileSync('services/config.js', 'utf8');
  assert.match(configSource, /SERVER_BASE_URL/, 'config must define SERVER_BASE_URL');
  assert.match(configSource, /OAUTH_TOKEN_URL/, 'config must define OAUTH_TOKEN_URL');
  assert.match(configSource, /STORAGE_KEYS/, 'config must define STORAGE_KEYS');

  const bindingSource = fs.readFileSync('services/binding.js', 'utf8');
  assert.match(bindingSource, /getDeviceId/, 'binding must export getDeviceId');
  assert.match(bindingSource, /getBindingStatus/, 'binding must export getBindingStatus');
  assert.match(bindingSource, /parseQrPayload/, 'binding must export parseQrPayload');
  assert.match(bindingSource, /requestBinding/, 'binding must export requestBinding');
  assert.match(bindingSource, /getValidAccessToken/, 'binding must export getValidAccessToken');
  assert.match(bindingSource, /clearBinding/, 'binding must export clearBinding');
  assert.match(bindingSource, /wx\.request/, 'binding must use wx.request for network calls');
}

function testIndexPage() {
  const source = fs.readFileSync('pages/index/index.ink', 'utf8');
  assert.match(source, /SpeechRecognition/, 'index page must use SpeechRecognition');
  assert.match(source, /runAgentTurn/, 'index page must run agent loop');
  assert.match(source, /saveMoment/, 'index page must save moments');
  assert.match(source, /searchMoments/, 'index page must search moments');
  assert.match(source, /getValidAccessToken/, 'index page must validate binding token');
  // 未绑定时跳回 welcome 重新走流程（避免与 scan 形成死循环）
  assert.match(source, /pages\/welcome\/welcome/, 'index page must redirect to welcome when unbound');
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
testWelcomeRouting();
testScanPage();
testBindingService();
testIndexPage();
testConversationServices();
testAppJsConfig();
testDocumentationLinks();
console.log('Local MVP regression checks passed.');
