import { createInkView } from '@yodaos-pkg/ink';
import { createLocalHostCapabilities } from './host-capabilities.js';

const sourceModules = import.meta.glob(
  [
    '../AGENTS.md',
    '../app.js',
    '../app.json',
    '../pages/**/*.ink',
    '../services/**/*.js',
    '../prompts/**/*.{md,js}'
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
const runtimeChip = document.querySelector('#runtime-chip');
const activePageLabel = document.querySelector('#active-page-label');
const speechMode = document.querySelector('#speech-mode');
const mockTranscript = document.querySelector('#mock-transcript');
const speechStatus = document.querySelector('#speech-status');
const speechSessionLabel = document.querySelector('#speech-session-label');
const voiceConsole = document.querySelector('#voice-console');
const voiceWakeupButton = document.querySelector('#voice-wakeup-button');
const sendSpeechButton = document.querySelector('#send-speech-button');
const keyButtons = Array.from(document.querySelectorAll('[data-key-code]'));
const cameraMode = document.querySelector('#camera-mode');
const cameraStatus = document.querySelector('#camera-status');
const preparePhotoButton = document.querySelector('#prepare-photo-button');
const photoPreview = document.querySelector('#photo-preview');
const llmEndpointValue = document.querySelector('#llm-endpoint-value');
const llmModelValue = document.querySelector('#llm-model-value');
const llmAuthValue = document.querySelector('#llm-auth-value');
const testLlmButton = document.querySelector('#test-llm-button');
const llmState = document.querySelector('#llm-state');
const agentTraceList = document.querySelector('#agent-trace-list');

let view = null;
let hostCapabilities = null;
let photoObjectUrl = '';
let currentLlmConfig = null;
let speechSessionState = { listening: false, mode: 'mock', canSubmit: false, sessionId: '' };
const agentTraceEvents = [];

function renderAgentTrace() {
  if (!agentTraceList) return;
  agentTraceList.replaceChildren();
  if (!agentTraceEvents.length) {
    const empty = document.createElement('div');
    empty.className = 'trace-empty';
    empty.textContent = '等待 Agent Turn';
    agentTraceList.appendChild(empty);
    return;
  }
  agentTraceEvents.slice(-10).forEach((event) => {
    const item = document.createElement('div');
    item.className = 'trace-event';
    const title = document.createElement('strong');
    title.textContent = event.type || 'agent.event';
    const detail = document.createElement('span');
    const fields = [event.toolName, event.intentType, event.reason, event.promptId]
      .filter(Boolean)
      .join(' · ');
    detail.textContent = fields || event.turnId || '';
    item.append(title, detail);
    agentTraceList.appendChild(item);
  });
  agentTraceList.scrollTop = agentTraceList.scrollHeight;
}

function captureAgentTrace(args) {
  const text = args.map((value) => typeof value === 'string' ? value : '').join(' ');
  const marker = '[moment-one:agent-trace]';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return;
  const payload = text.slice(markerIndex + marker.length).trim();
  const jsonStart = payload.indexOf('{');
  const jsonEnd = payload.lastIndexOf('}');
  if (jsonStart < 0 || jsonEnd <= jsonStart) return;
  try {
    agentTraceEvents.push(JSON.parse(payload.slice(jsonStart, jsonEnd + 1)));
    if (agentTraceEvents.length > 60) agentTraceEvents.splice(0, agentTraceEvents.length - 60);
    renderAgentTrace();
  } catch {
    // Ink console may append style arguments; malformed traces stay in the browser console.
  }
}

const originalConsoleInfo = console.info.bind(console);
console.info = (...args) => {
  captureAgentTrace(args);
  originalConsoleInfo(...args);
};

function setStatus(element, message, state = '') {
  element.textContent = message;
  element.dataset.state = state;
  if (element === runtimeStatus && runtimeChip) {
    runtimeChip.dataset.state = state || 'loading';
  }
}

function updateSpeechControls(nextState = {}) {
  speechSessionState = { ...speechSessionState, ...nextState };
  const listening = Boolean(speechSessionState.listening);
  const manualInputEnabled = listening
    && speechSessionState.canSubmit
    && speechSessionState.mode === 'mock';

  voiceConsole.dataset.listening = String(listening);
  speechMode.disabled = listening;
  mockTranscript.disabled = !manualInputEnabled;
  mockTranscript.placeholder = listening
    ? (manualInputEnabled ? '输入模拟语音消息，回车发送' : '浏览器麦克风正在监听…')
    : '等待页面开启 STT…';
  sendSpeechButton.disabled = !manualInputEnabled || !mockTranscript.value.trim();
  voiceWakeupButton.disabled = !view || listening;

  if (!listening) {
    speechSessionLabel.textContent = 'STT 未监听';
  } else if (speechSessionState.mode === 'mock') {
    speechSessionLabel.textContent = 'STT 监听中 · 可发送';
  } else {
    speechSessionLabel.textContent = 'STT 监听中 · 麦克风';
  }
}

function dispatchInkKey(code) {
  if (!view) return;
  const timestamp = Date.now();
  view.notifyUserInteraction();
  view.dispatchInput('keydown', code, timestamp);
  view.dispatchInput('keyup', code, timestamp + 1);
  view.requestRender();
  canvas.focus();
}

function sendSpeechTranscript() {
  if (!hostCapabilities) return;
  const transcript = mockTranscript.value.trim();
  const result = hostCapabilities.speech.submitTranscript(transcript);
  if (result.ok) {
    persistCapabilitySettings();
    return;
  }

  const messages = {
    'not-listening': '页面当前没有开启 STT，无法发送语音消息。',
    'browser-mode': '浏览器麦克风模式不接受模拟文本，请直接说话。',
    'empty-transcript': '请输入要发送的模拟语音消息。'
  };
  setStatus(speechStatus, messages[result.reason] || '语音消息发送失败。', 'warning');
}

function restoreCapabilitySettings() {
  speechMode.value = localStorage.getItem('moment-one-dev:speech-mode') || 'mock';
  cameraMode.value = localStorage.getItem('moment-one-dev:camera-mode') || 'mock';
  mockTranscript.value =
    localStorage.getItem('moment-one-dev:mock-transcript') || mockTranscript.value;
  activePageLabel.textContent = initialPage || '未选择页面';
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
updateSpeechControls({ mode: speechMode.value });

pageSelect.addEventListener('change', reloadWithSelectedPage);
reloadButton.addEventListener('click', () => {
  persistCapabilitySettings();
  window.location.reload();
});
speechMode.addEventListener('change', () => {
  persistCapabilitySettings();
  updateSpeechControls({ mode: speechMode.value, canSubmit: false });
});
cameraMode.addEventListener('change', () => {
  persistCapabilitySettings();
  if (cameraMode.value === 'mock') preparePhoto();
  else setStatus(cameraStatus, '点击“准备并测试照片”后允许 Chrome 摄像头权限', 'warning');
});
preparePhotoButton.addEventListener('click', preparePhoto);
mockTranscript.addEventListener('input', () => {
  sendSpeechButton.disabled = !speechSessionState.listening
    || !speechSessionState.canSubmit
    || !mockTranscript.value.trim();
});
mockTranscript.addEventListener('change', persistCapabilitySettings);
mockTranscript.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    if (!sendSpeechButton.disabled) sendSpeechTranscript();
  }
});
sendSpeechButton.addEventListener('click', sendSpeechTranscript);
voiceWakeupButton.addEventListener('click', () => {
  if (!view || speechSessionState.listening) return;
  view.notifyUserInteraction();
  // 先聚焦 canvas，确保 InkView 进入交互态后再派发唤醒，
  // 否则 onVoiceWakeup 同步触发时 InkView 仍处于 blurred，SpeechRecognition.start() 会抛 InvalidStateError
  canvas.focus();
  view.dispatchVoiceWakeup('leqi');
  setStatus(speechStatus, '已发送语音唤醒（leqi），等待页面开启 STT。', 'active');
});
keyButtons.forEach((button) => {
  button.addEventListener('click', () => dispatchInkKey(button.dataset.keyCode));
});
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
    onSpeechSessionChange: updateSpeechControls,
    onCameraStatus: (message, state) => setStatus(cameraStatus, message, state),
    onPhoto: showPhoto
  });

  // 快速记录页面会在 onShow 立即读取预置照片；模拟模式必须先准备桥接数据。
  if (cameraMode.value === 'mock') await preparePhoto();

  view = await createInkView({
    width: 448,
    height: 352,
    scaleFactor: window.devicePixelRatio,
    canvas,
    hostCapabilities
  });

  view.bindDomEvents({ keyboardTarget: new EventTarget() });
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
    getLlmConfig: () => currentLlmConfig,
    dispatchKey: dispatchInkKey,
    sendSpeechTranscript
  };

  canvas.focus();
  updateSpeechControls(hostCapabilities.speech.getSessionState());
  setStatus(runtimeStatus, `运行中：${initialPage}`, 'ready');
  console.info('[preview] Ink bundle opened', { initialPage });

  if (cameraMode.value !== 'mock') {
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
