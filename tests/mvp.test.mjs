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
    ['窗外正在下雨，我想记住此刻', 'moment.create'],
    ['什么是量子力学', 'unknown'],
    ['帮我写一首诗', 'unknown'],
    ['天气怎么样？', 'unknown'],
  ];
  cases.forEach(([input, expected]) => {
    assert.equal(fallbackRecognizeIntent(input).type, expected, input);
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
  const names = MOMENT_TOOL_DEFINITIONS.map((tool) => tool.function.name);
  assert.equal(new Set(names).size, names.length, 'tool names must be unique');
  assert.deepEqual(names, [
    'moment_create',
    'moment_search',
    'moment_update',
    'moment_delete_request',
    'moment_clear_request',
    'config_get',
    'config_set',
  ]);
}

function testToolPolicy() {
  const safeCreate = resolveToolCall(
    { name: 'moment_create', arguments: { content: '模型改写内容' } },
    '记录今天看海',
  );
  assert.equal(safeCreate.ok, true);
  assert.equal(safeCreate.intent.content, '今天看海', 'create must preserve cleaned user text');

  const naturalCreate = resolveToolCall(
    { name: 'moment_create', arguments: { content: '今天天气不错' } },
    '今天天气不错',
  );
  assert.equal(naturalCreate.ok, true);
  assert.equal(naturalCreate.intent.content, '今天天气不错');

  assert.equal(resolveToolCall(
    { name: 'moment_create', arguments: { content: '天气怎么样' } },
    '天气怎么样？',
  ).ok, false);

  assert.equal(resolveToolCall(
    { name: 'moment_create', arguments: { content: '量子力学' } },
    '什么是量子力学',
  ).ok, false);

  assert.equal(resolveToolCall(
    { name: 'moment_delete_request', arguments: { targetReference: '面馆' } },
    '今天天气不错',
  ).ok, false);

  assert.equal(resolveToolCall(
    { name: 'config_set', arguments: { key: 'instant_memory', value: true } },
    '关闭即刻记忆',
  ).ok, false);

  const query = resolveToolCall(
    {
      name: 'moment_search',
      arguments: { query: '所有记录', mode: 'count', timeRange: 'all' },
    },
    '我有多少条记录',
  );
  assert.equal(query.ok, true);
  assert.equal(query.intent.mode, 'count');
}

function testMemoryRepository() {
  const storage = memoryStorage();
  const repository = createMemoryRepository({
    storage,
    maxMoments: 3,
    now: () => '2026-07-30T12:00:00.000Z',
    logger: { warn() {} },
  });

  repository.saveMoment(moment('old', '2026-07-27T00:00:00.000Z', {
    title: '西湖边散步',
    category: 'travel',
    tags: ['旅行', '散步'],
    location: { name: '西湖', source: 'device' },
  }));
  repository.saveMoment(moment('food', '2026-07-28T00:00:00.000Z', {
    title: '吃了一碗面',
    category: 'food',
    tags: ['美食', '面馆'],
  }));
  repository.saveMoment(moment('latest', '2026-07-29T00:00:00.000Z', {
    title: '完成一本书',
    category: 'growth',
  }));

  assert.deepEqual(repository.listMoments().map((item) => item.id), ['latest', 'food', 'old']);
  assert.equal(repository.getMoment('food').title, '吃了一碗面');
  assert.equal(repository.searchMoments('面馆', 3)[0].id, 'food');
  assert.equal(repository.searchMoments('去过西湖', 3)[0].id, 'old');

  const updated = repository.updateMoment('food', { id: 'malicious-id', title: '修改后的面馆' });
  assert.equal(updated.id, 'food', 'update cannot change Moment id');
  assert.equal(updated.updatedAt, '2026-07-30T12:00:00.000Z');
  assert.equal(updated.revision, 1, 'revision increments on update');
  assert.equal(updated.syncState, 'pending', 'syncState resets to pending on update');

  repository.saveMoment(moment('overflow', '2026-07-30T00:00:00.000Z'));
  assert.equal(repository.listMoments().length, 3, 'repository must enforce local cap');
  assert.equal(repository.getMoment('old'), null, 'oldest Moment is removed after cap');

  assert.equal(repository.deleteMoment('food'), true);
  assert.equal(repository.deleteMoment('missing'), false);
  assert.equal(repository.clearMoments(), 2);
  assert.equal(repository.listMoments().length, 0);
  assert.throws(() => repository.saveMoment({ title: 'missing id' }), /Moment id is required/);
}

function testLocalMvpSurface() {
  const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  assert.deepEqual(appConfig.pages, [
    'pages/index/index',
    'pages/cards/moment-result',
    'pages/cards/memory-answer',
  ]);

  for (const card of ['pages/cards/moment-result.ink', 'pages/cards/memory-answer.ink']) {
    const source = fs.readFileSync(card, 'utf8');
    assert.equal(/<button|bindtap=/.test(source), false, `${card} must remain display-only`);
  }

  const inkPages = fs.readdirSync('pages', { recursive: true })
    .filter((file) => String(file).endsWith('.ink'));
  inkPages.forEach((file) => {
    const pagePath = path.join('pages', String(file));
    const source = fs.readFileSync(pagePath, 'utf8');
    assert.equal(/<button|bindtap=/.test(source), false, `${pagePath} must be voice-first without buttons`);
  });

  assert.equal(fs.existsSync('services/mcp'), false, 'local MVP must not package MCP runtime');
  assert.equal(fs.existsSync('mcp-configs'), false, 'local MVP must not package MCP config');
  assert.equal(fs.existsSync('pages/cards/mcp-app.ink'), false, 'local MVP must not package MCP App page');

  const appSource = fs.readFileSync('app.js', 'utf8');
  assert.match(appSource, /repositoryMode:\s*'local'/);
  assert.match(appSource, /cloudSyncEnabled:\s*false/);
  assert.match(appSource, /mcpEnabled:\s*false/);

  const indexSource = fs.readFileSync('pages/index/index.ink', 'utf8');
  assert.match(indexSource, /photoPreviewUrl/);
  assert.match(indexSource, /照片预览/);
  assert.match(indexSource, /startQuickRecord/);
  assert.match(indexSource, /resumePendingActionListening/);

  const devHostSource = fs.readFileSync('dev/host-capabilities.js', 'utf8');
  assert.match(devHostSource, /startAudioRecording/);
  assert.match(devHostSource, /media\.audioRecordingStopped/);
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
testLocalMvpSurface();
testDocumentationLinks();
console.log('Local MVP regression checks passed.');
