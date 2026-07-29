function bytesFromBlob(blob) {
  return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('浏览器无法编码摄像头画面'));
    }, type, quality);
  });
}

function waitForVideo(video, timeoutMs = 8000) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('等待摄像头画面超时'));
    }, timeoutMs);

    const handleReady = () => {
      if (video.videoWidth <= 0) return;
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(video.error || new Error('摄像头视频流不可用'));
    };

    const cleanup = () => {
      window.clearTimeout(timer);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('error', handleError);
    };

    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('error', handleError);
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function waitForVideoFrame(video, timeoutMs = 1500) {
  if (typeof video.requestVideoFrameCallback !== 'function') {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  return new Promise((resolve) => {
    let completed = false;
    const timer = window.setTimeout(() => {
      if (completed) return;
      completed = true;
      resolve();
    }, timeoutMs);

    video.requestVideoFrameCallback(() => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timer);
      resolve();
    });
  });
}

function estimateFrameBrightness(sourceCanvas) {
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = 32;
  sampleCanvas.height = 24;
  const context = sampleCanvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(sourceCanvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
  const pixels = context.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
  let luminance = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    luminance += pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
  }
  return luminance / (pixels.length / 4);
}

async function captureBrowserPhoto(quality, onProgress = () => {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('当前浏览器不支持 navigator.mediaDevices.getUserMedia()');
  }

  // 桌面调试优先使用系统默认摄像头。强制 environment 在 macOS 上可能会选中
  // Continuity Camera 或非预期设备，导致首帧过暗或方向异常。
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  });

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.srcObject = stream;
  video.style.position = 'fixed';
  video.style.left = '-10000px';
  video.style.top = '0';
  video.style.width = '2px';
  video.style.height = '2px';
  video.style.opacity = '0';
  video.setAttribute('aria-hidden', 'true');
  document.body.appendChild(video);

  try {
    await video.play();
    await waitForVideo(video);
    onProgress('摄像头已连接，正在等待自动曝光', 'active');

    // 摄像头刚启动时第一帧经常是黑帧，等待多帧和自动曝光稳定。
    await waitForVideoFrame(video);
    await delay(1000);
    await waitForVideoFrame(video);

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = width;
    captureCanvas.height = height;
    const context = captureCanvas.getContext('2d', { alpha: false });

    context.drawImage(video, 0, 0, width, height);
    let brightness = estimateFrameBrightness(captureCanvas);

    // 如果仍接近黑帧，再给自动曝光一次机会。
    if (brightness < 12) {
      onProgress('检测到画面过暗，正在重新曝光', 'warning');
      await delay(1400);
      await waitForVideoFrame(video);
      context.drawImage(video, 0, 0, width, height);
      brightness = estimateFrameBrightness(captureCanvas);
    }

    const qualityValue = quality === 'low' ? 0.7 : quality === 'normal' ? 0.84 : 0.94;
    const blob = await canvasToBlob(captureCanvas, 'image/jpeg', qualityValue);
    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings?.() || {};

    return {
      data: await bytesFromBlob(blob),
      mimeType: blob.type || 'image/jpeg',
      width,
      height,
      brightness: Math.round(brightness),
      deviceLabel: track?.label || '',
      settings
    };
  } finally {
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    video.remove();
  }
}
async function createMockPhoto() {
  const width = 896;
  const height = 704;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  context.fillStyle = '#020702';
  context.fillRect(0, 0, width, height);

  context.strokeStyle = 'rgba(64, 255, 94, 0.32)';
  context.lineWidth = 2;
  for (let x = 0; x <= width; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y <= height; y += 64) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }

  context.fillStyle = '#40ff5e';
  context.font = '700 42px sans-serif';
  context.fillText('Moment One Local Camera', 54, 92);
  context.font = '28px sans-serif';
  context.fillText('模拟第一视角画面', 54, 144);

  context.strokeStyle = '#40ff5e';
  context.lineWidth = 6;
  context.strokeRect(230, 210, 436, 300);

  context.font = '24px monospace';
  context.fillText(new Date().toISOString(), 54, 650);

  const blob = await canvasToBlob(canvas, 'image/png');
  return {
    data: await bytesFromBlob(blob),
    mimeType: 'image/png',
    width,
    height,
    brightness: 18,
    deviceLabel: 'Moment One Mock Camera'
  };
}

function createSpeechAdapter({ getView, getMode, getMockTranscript, onStatus, onSessionChange }) {
  const sessions = new Map();

  function getActiveSession() {
    return Array.from(sessions.values()).find((session) => !session.ended) || null;
  }

  function notifySessionChange() {
    const session = getActiveSession();
    onSessionChange?.({
      listening: Boolean(session),
      mode: session?.mode || getMode(),
      canSubmit: session?.mode === 'mock',
      sessionId: session?.request?.sessionId || '',
      targetId: session?.request?.targetId || ''
    });
  }

  function dispatch(type, request, extra = {}) {
    const view = getView();
    if (!view) return;

    view.hostCapabilitiesTarget.dispatchEvent(
      new CustomEvent(type, {
        detail: {
          targetId: request.targetId,
          sessionId: request.sessionId,
          ...extra
        }
      })
    );
  }

  function finishSession(session, { aborted = false } = {}) {
    if (!session || session.ended) return;
    session.ended = true;
    session.timers?.forEach((timer) => window.clearTimeout(timer));

    if (aborted) {
      dispatch('speech.error', session.request, {
        error: 'aborted',
        message: '本地语音识别已中止'
      });
    }

    dispatch('speech.speechend', session.request);
    dispatch('speech.soundend', session.request);
    dispatch('speech.audioend', session.request);
    dispatch('speech.end', session.request);
    sessions.delete(session.request.sessionId);
    onStatus('语音识别已结束', aborted ? 'warning' : 'ready');
    notifySessionChange();
  }

  function emitMockResult(session, providedTranscript = '') {
    if (!session || session.resultEmitted || session.ended) return false;
    const transcript = String(providedTranscript || getMockTranscript() || '').trim();
    if (!transcript) return false;
    session.resultEmitted = true;

    dispatch('speech.result', session.request, {
      resultIndex: 0,
      isFinal: true,
      alternatives: [{ transcript, confidence: 0.99 }]
    });
    onStatus(`模拟识别：${transcript}`, 'ready');
    return true;
  }

  function startMockRecognition(request) {
    const session = {
      request,
      mode: 'mock',
      ended: false,
      resultEmitted: false
    };
    sessions.set(request.sessionId, session);

    dispatch('speech.start', request);
    dispatch('speech.audiostart', request);
    dispatch('speech.soundstart', request);
    dispatch('speech.speechstart', request);
    onStatus('模拟语音监听已开启，等待下方调试窗口发送输入', 'active');
    notifySessionChange();
  }

  function startBrowserRecognition(request) {
    const NativeRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!NativeRecognition) {
      throw new Error('当前浏览器没有提供 SpeechRecognition/webkitSpeechRecognition');
    }

    const recognition = new NativeRecognition();
    recognition.lang = request.lang || 'zh-CN';
    recognition.continuous = Boolean(request.continuous);
    recognition.interimResults = Boolean(request.interimResults);
    recognition.maxAlternatives = Math.max(1, Number(request.maxAlternatives) || 1);

    const session = {
      request,
      mode: 'browser',
      recognition,
      ended: false
    };
    sessions.set(request.sessionId, session);
    notifySessionChange();

    recognition.onstart = () => {
      dispatch('speech.start', request);
      onStatus('浏览器语音识别中，请开始说话', 'active');
    };
    recognition.onaudiostart = () => dispatch('speech.audiostart', request);
    recognition.onsoundstart = () => dispatch('speech.soundstart', request);
    recognition.onspeechstart = () => dispatch('speech.speechstart', request);
    recognition.onspeechend = () => dispatch('speech.speechend', request);
    recognition.onsoundend = () => dispatch('speech.soundend', request);
    recognition.onaudioend = () => dispatch('speech.audioend', request);

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const alternatives = Array.from(result).map((alternative) => ({
          transcript: alternative.transcript,
          confidence: Number(alternative.confidence || 0)
        }));

        dispatch('speech.result', request, {
          resultIndex: index,
          isFinal: Boolean(result.isFinal),
          alternatives
        });

        if (alternatives[0]?.transcript) {
          onStatus(`识别结果：${alternatives[0].transcript}`, result.isFinal ? 'ready' : 'active');
        }
      }
    };

    recognition.onerror = (event) => {
      dispatch('speech.error', request, {
        error: event.error || 'recognition-error',
        message: event.message || event.error || '浏览器语音识别失败'
      });
      onStatus(`语音错误：${event.error || 'unknown'}`, 'error');
    };

    recognition.onend = () => {
      if (session.ended) return;
      session.ended = true;
      dispatch('speech.end', request);
      sessions.delete(request.sessionId);
      onStatus('浏览器语音识别已结束', 'ready');
      notifySessionChange();
    };

    try {
      recognition.start();
    } catch (error) {
      sessions.delete(request.sessionId);
      notifySessionChange();
      throw error;
    }
  }

  return {
    speak(request) {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
        throw new Error('当前浏览器不支持 speechSynthesis');
      }
      const utterance = new SpeechSynthesisUtterance(request.text);
      utterance.lang = request.lang || 'zh-CN';
      utterance.pitch = request.pitch;
      utterance.rate = request.rate;
      utterance.volume = request.volume;
      window.speechSynthesis.speak(utterance);
    },

    startRecognition(request) {
      if (getMode() === 'mock') startMockRecognition(request);
      else startBrowserRecognition(request);
    },

    submitTranscript(transcript) {
      const session = getActiveSession();
      if (!session) {
        return { ok: false, reason: 'not-listening' };
      }
      if (session.mode !== 'mock') {
        return { ok: false, reason: 'browser-mode' };
      }
      if (!emitMockResult(session, transcript)) {
        return { ok: false, reason: 'empty-transcript' };
      }
      finishSession(session);
      return { ok: true, sessionId: session.request.sessionId };
    },

    getSessionState() {
      const session = getActiveSession();
      return {
        listening: Boolean(session),
        mode: session?.mode || getMode(),
        canSubmit: session?.mode === 'mock',
        sessionId: session?.request?.sessionId || ''
      };
    },

    stopRecognition(request) {
      const session = sessions.get(request.sessionId);
      if (!session) return;
      if (session.mode === 'mock') {
        finishSession(session);
      } else {
        session.recognition.stop();
      }
    },

    abortRecognition(request) {
      const session = sessions.get(request.sessionId);
      if (!session) return;
      if (session.mode === 'mock') finishSession(session, { aborted: true });
      else session.recognition.abort();
    }
  };
}

export function createLocalHostCapabilities({
  getView,
  getSpeechMode,
  getCameraMode,
  getMockTranscript,
  onSpeechStatus,
  onSpeechSessionChange,
  onCameraStatus,
  onPhoto
}) {
  const capabilities = {
    speech: createSpeechAdapter({
      getView,
      getMode: getSpeechMode,
      getMockTranscript,
      onStatus: onSpeechStatus,
      onSessionChange: onSpeechSessionChange
    }),

    media: {
      async takePhoto(request) {
        const mode = getCameraMode();
        onCameraStatus(mode === 'mock' ? '正在生成模拟照片' : '正在请求浏览器摄像头', 'active');

        try {
          const photo = mode === 'mock'
            ? await createMockPhoto()
            : await captureBrowserPhoto(request.quality, onCameraStatus);
          await onPhoto(photo);
          onCameraStatus(
            `${mode === 'mock' ? '模拟照片' : '浏览器照片'}已捕获，${photo.width || '-'} × ${photo.height || '-'}，${photo.data.byteLength} bytes`,
            'ready'
          );
          return photo;
        } catch (error) {
          onCameraStatus(`摄像头错误：${error.message || error}`, 'error');
          throw error;
        }
      }
    }
  };

  capabilities.languageModel = {
    async getConfig() {
      const response = await fetch('/api/language-model/config', { cache: 'no-store' });
      const config = await response.json();
      if (!response.ok || !config.enabled) {
        throw new Error('本地 LanguageModel 代理尚未配置');
      }

      return {
        endpoint: `${window.location.origin}/api/language-model`,
        defaultModel: config.model || null,
        apiStyle: config.apiStyle || 'openai-chat-completions',
        headers: {}
      };
    }
  };

  return capabilities;
}
