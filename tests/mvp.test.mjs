import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function testAppConfig() {
  const appConfig = JSON.parse(fs.readFileSync('app.json', 'utf8'));
  assert.deepEqual(appConfig.pages, [
    'pages/welcome/welcome',
    'pages/scan/scan',
    'pages/index/index',
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
  // welcome 页必须根据 deviceBound 分流到 scan 或 index
  assert.match(source, /deviceBound/, 'welcome must check deviceBound storage');
  assert.match(source, /pages\/scan\/scan/, 'welcome must route to scan page when unbound');
  assert.match(source, /pages\/index\/index/, 'welcome must route to index page when bound');
}

function testScanPage() {
  const source = fs.readFileSync('pages/scan/scan.ink', 'utf8');
  assert.match(source, /BarcodeDetector/, 'scan page must use BarcodeDetector');
  assert.match(source, /createCameraContext/, 'scan page must open camera');
  assert.match(source, /setStorageSync/, 'scan page must persist binding state');
  assert.match(source, /pages\/index\/index/, 'scan page must redirect to index after binding');
}

function testIndexPage() {
  const source = fs.readFileSync('pages/index/index.ink', 'utf8');
  // 对话主页框架，不含 ASR/拍照/记忆业务逻辑
  assert.equal(/SpeechRecognition|startRecognition|recognition\./.test(source), false,
    'index page must not contain ASR logic');
  assert.equal(/takePhoto|createCameraContext|photoPreviewUrl/.test(source), false,
    'index page must not contain photo capture logic');
  assert.equal(/moment|Moment|memoryRepository|saveMoment/.test(source), false,
    'index page must not contain moment/memory business logic');
}

function testAppJsConfig() {
  const appSource = fs.readFileSync('app.js', 'utf8');
  assert.match(appSource, /repositoryMode:\s*'local'/);
  assert.match(appSource, /cloudSyncEnabled:\s*false/);
  assert.match(appSource, /mcpEnabled:\s*false/);
}

function testRemovedLegacyArtifacts() {
  // 已删除的对话/Agent 相关模块
  assert.equal(fs.existsSync('services/agent-loop.js'), false, 'agent-loop.js should be removed');
  assert.equal(fs.existsSync('services/agent-trace.js'), false, 'agent-trace.js should be removed');
  assert.equal(fs.existsSync('services/intent-router.js'), false, 'intent-router.js should be removed');
  assert.equal(fs.existsSync('services/moment-ai.js'), false, 'moment-ai.js should be removed');
  assert.equal(fs.existsSync('services/tools'), false, 'services/tools should be removed');
  assert.equal(fs.existsSync('services/card-presenter.js'), false, 'card-presenter.js should be removed');
  assert.equal(fs.existsSync('services/memory-repository.js'), false, 'memory-repository.js should be removed');
  assert.equal(fs.existsSync('services/memory-store.js'), false, 'memory-store.js should be removed');
  assert.equal(fs.existsSync('services/record-media.js'), false, 'record-media.js should be removed');
  assert.equal(fs.existsSync('services/format.js'), false, 'format.js should be removed');
  assert.equal(fs.existsSync('pages/cards'), false, 'pages/cards should be removed');

  // 保留的基础设施
  assert.equal(fs.existsSync('services/controls.js'), true, 'controls.js should be retained');
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

testAppConfig();
testPagesVoiceFirst();
testWelcomeRouting();
testScanPage();
testIndexPage();
testAppJsConfig();
testRemovedLegacyArtifacts();
testDocumentationLinks();
console.log('Local MVP regression checks passed.');
