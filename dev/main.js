import { createInkView } from '@yodaos-pkg/ink';
import { createLocalHostCapabilities } from './host-capabilities.js';

const sourceModules = import.meta.glob(
  [
    '../AGENTS.md',
    '../app.js',
    '../app.json',
    '../pages/**/*.ink',
    '../services/**/*.js',
    '../prompts/**/*.md'
  ],
  {
    eager: true,
    query: '?raw',
    import: 'default'
  }
);

const files = Object.fromEntries(
  Object.entries(sourceModules).map(([filePath, content]) => [
    filePath.replace(/^\.\.\//, ''),
    content
  ])
);

const appConfig = JSON.parse(files['app.json']);
const availablePages = Array.isArray(appConfig.pages) ? appConfig.pages : [];
const searchParams = new URLSearchParams(window.location.search);
const requestedPage = searchParams.get('page');
const initialPage = availablePages.includes(requestedPage)
  ? requestedPage
  : availablePages[0];
const launchQuery = Object.fromEntries(
  Array.from(searchParams.entries()).filter(([key]) => key !== 'page')
);
launchQuery.localDebug = 'true';
launchQuery.localDebugPhotoEndpoint = `${window.location.origin}/api/local-photo`;

const canvas = document.querySelector('#ink-root');
const pageSelect = document.querySelector('#page-select');
const reloadButton = document.querySelector('#reload-button');
const runtimeStatus = document.querySelector('#runtime-status');
const speechMode = document.querySelector('#speech-mode');
const mockTranscript = document.querySelector('#mock-transcript');
const speechStatus = document.querySelector('#speech-status');
const cameraMode = document.querySelector('#camera-mode');
const cameraStatus = document.querySelector('#camera-status');
const preparePhotoButton = document.querySelector('#prepare-photo-button');
const photoPreview = document.querySelector('#photo-preview');
const llmEndpointValue = document.querySelector('#llm-endpoint-value');
const llmModelValue = document.querySelector('#llm-model-value');
const llmAuthValue = document.querySelector('#llm-auth-value');
const testLlmButton = document.querySelector('#test-llm-button');
const llmState = document.querySelector('#llm-state');

let view = null;
let hostCapabilities = null;
let photoObjectUrl = '';
let currentLlmConfig = null;

function setStatus(element, message, state = '') {
  element.textContent = message;
  element.dataset.state = state;
}

function restoreCapabilitySettings() {
  speechMode.value = localStorage.getItem('moment-one-dev:speech-mode') || 'mock';
  cameraMode.value = localStorage.getItem('moment-one-dev:camera-mode') || 'mock';
  mockTranscript.value =
    localStorage.getItem('moment-one-dev:mock-transcript') || mockTranscript.value;
}

function persistCapabilitySettings() {
  localStorage.setItem('moment-one-dev:speech-mode', speechMode.value);
  localStorage.setItem('moment-one-dev:camera-mode', cameraMode.value);
  localStorage.setItem('moment-one-dev:mock-transcript', mockTranscript.value);
}

function renderPageOptions() {
  availablePages.forEach((page) => {
    const option = document.createElement('option');
    option.value = page;
    option.textContent = page;
    option.selected = page === initialPage;
    pageSelect.appendChild(option);
  });
}

function renderLanguageModelConfig(config, message = '') {
  currentLlmConfig = config;
  llmEndpointValue.textContent = config.endpoint || '未配置';
  llmModelValue.textContent = config.model || '未配置';
  llmAuthValue.textContent = config.apiKeyConfigured
    ? `${config.authHeader || 'Authorization'} · 已配置密钥`
    : '无密钥或未配置';

  llmState.className = config.enabled ? 'llm-state is-enabled' : 'llm-state';
  llmState.textContent = message || (config.enabled
    ? `真实代理已启用：${config.model}`
    : '未配置代理，当前会验证 LanguageModel 离线降级。');
}

async function loadLanguageModelConfig() {
  const response = await fetch('/api/language-model/config', { cache: 'no-store' });
  const config = await response.json();
  if (!response.ok) throw new Error(config.error?.message || `HTTP ${response.status}`);
  renderLanguageModelConfig(config);
  return config;
}

async function testLanguageModelProxy() {
  testLlmButton.disabled = true;
  llmState.className = 'llm-state';
  llmState.textContent = '正在请求真实上游模型';

  try {
    const response = await fetch('/api/language-model/test', { method: 'POST' });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      throw new Error(result.error?.message || `上游 HTTP ${result.status}`);
    }

    llmState.className = 'llm-state is-enabled';
    llmState.textContent = `真实代理测试通过：HTTP ${result.status}，${result.durationMs}ms`;
    console.info('[llm-proxy] upstream test response', result);
  } catch (error) {
    llmState.className = 'llm-state';
    llmState.textContent = `代理测试失败：${error.message || error}`;
    console.error('[llm-proxy] test failed', error);
  } finally {
    testLlmButton.disabled = false;
  }
}

function reloadWithSelectedPage() {
  persistCapabilitySettings();
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('page', pageSelect.value);
  window.location.assign(nextUrl);
}

async function showPhoto(photo) {
  if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  const blob = new Blob([photo.data], { type: photo.mimeType });
  photoObjectUrl = URL.createObjectURL(blob);
  photoPreview.src = photoObjectUrl;
  photoPreview.classList.add('is-visible');

  const response = await fetch('/api/local-photo', {
    method: 'POST',
    headers: { 'Content-Type': photo.mimeType },
    body: photo.data
  });
  if (!response.ok) throw new Error(`照片桥接上传失败：HTTP ${response.status}`);
}

async function preparePhoto() {
  if (!hostCapabilities) return;
  preparePhotoButton.disabled = true;
  try {
    await hostCapabilities.media.takePhoto({ quality: 'high' });
  } catch (error) {
    console.warn('[preview] unable to prepare local photo', error);
  } finally {
    preparePhotoButton.disabled = false;
  }
}

restoreCapabilitySettings();
renderPageOptions();

pageSelect.addEventListener('change', reloadWithSelectedPage);
reloadButton.addEventListener('click', () => {
  persistCapabilitySettings();
  window.location.reload();
});
speechMode.addEventListener('change', persistCapabilitySettings);
cameraMode.addEventListener('change', () => {
  persistCapabilitySettings();
  if (cameraMode.value === 'mock') preparePhoto();
  else setStatus(cameraStatus, '点击“准备并测试照片”后允许 Chrome 摄像头权限', 'warning');
});
preparePhotoButton.addEventListener('click', preparePhoto);
mockTranscript.addEventListener('change', persistCapabilitySettings);
testLlmButton.addEventListener('click', testLanguageModelProxy);

window.addEventListener('error', (event) => {
  setStatus(runtimeStatus, `运行错误：${event.message}`, 'error');
});

window.addEventListener('unhandledrejection', (event) => {
  const message = event.reason?.message || String(event.reason || '未知异步错误');
  setStatus(runtimeStatus, `异步错误：${message}`, 'error');
});

async function startPreview() {
  if (!initialPage) {
    throw new Error('app.json 没有注册任何页面');
  }

  const initialLlmConfig = await loadLanguageModelConfig();
  console.info('[preview] preparing bundle', {
    fileCount: Object.keys(files).length,
    initialPage,
    launchQuery,
    speechMode: speechMode.value,
    cameraMode: cameraMode.value,
    languageModelEnabled: initialLlmConfig.enabled
  });

  hostCapabilities = createLocalHostCapabilities({
    getView: () => view,
    getSpeechMode: () => speechMode.value,
    getCameraMode: () => cameraMode.value,
    getMockTranscript: () => mockTranscript.value,
    onSpeechStatus: (message, state) => setStatus(speechStatus, message, state),
    onCameraStatus: (message, state) => setStatus(cameraStatus, message, state),
    onPhoto: showPhoto
  });

  view = await createInkView({
    width: 448,
    height: 352,
    scaleFactor: window.devicePixelRatio,
    canvas,
    hostCapabilities
  });

  view.bindDomEvents();
  view.openBundle({
    appId: 'moment-one-local',
    files,
    initialPage,
    query: launchQuery
  });
  view.startRendering();

  globalThis.__MOMENT_ONE_DEV__ = {
    view,
    files,
    appConfig,
    initialPage,
    launchQuery,
    hostCapabilities,
    getLlmConfig: () => currentLlmConfig
  };

  canvas.focus();
  setStatus(runtimeStatus, `运行中：${initialPage}`, 'ready');
  console.info('[preview] Ink bundle opened', { initialPage });

  if (cameraMode.value === 'mock') {
    await preparePhoto();
  } else {
    setStatus(cameraStatus, '点击“准备并测试照片”后允许 Chrome 摄像头权限', 'warning');
  }

  window.addEventListener('beforeunload', () => {
    persistCapabilitySettings();
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
    view.destroy();
  });
}

startPreview().catch((error) => {
  console.error('[preview] unable to start Ink runtime', error);
  setStatus(runtimeStatus, `启动失败：${error.message || error}`, 'error');
});
