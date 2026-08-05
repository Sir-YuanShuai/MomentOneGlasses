import wx from 'wx';
import {
  BINDING_REQUEST_TIMEOUT_MS,
  OAUTH_TOKEN_URL,
  QR_BINDING_GRANT_TYPE,
  REFRESH_GRANT_TYPE,
  REFRESH_TOKEN_HARD_TTL_SECONDS,
  STORAGE_KEYS,
  TOKEN_REFRESH_BUFFER_SECONDS
} from './config.js';
import {
  normalizeBindingCode,
  parseQrPayload,
  resolveTokenError,
  shouldClearBindingAfterRefreshFailure,
  validateTokenResponse
} from './binding-core.js';

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      timeout: BINDING_REQUEST_TIMEOUT_MS,
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function readStored(key) {
  try {
    return wx.getStorageSync(key);
  } catch (error) {
    console.warn(`Unable to read binding storage ${key}:`, error);
    return undefined;
  }
}

function removeStored(key) {
  try {
    wx.removeStorageSync(key);
  } catch (error) {
    console.warn(`Unable to clear binding storage ${key}:`, error);
  }
}

function writeTokenBundle(bundle, options = {}) {
  const refreshTokenExpiresAt = options.refreshTokenExpiresAt
    || nowSeconds() + REFRESH_TOKEN_HARD_TTL_SECONDS;
  const entries = [
    [STORAGE_KEYS.BINDING_ID, bundle.bindingId],
    [STORAGE_KEYS.ACCESS_TOKEN, bundle.accessToken],
    [STORAGE_KEYS.REFRESH_TOKEN, bundle.refreshToken],
    [STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT, nowSeconds() + bundle.expiresIn],
    [STORAGE_KEYS.REFRESH_TOKEN_EXPIRES_AT, refreshTokenExpiresAt],
  ];

  try {
    for (const [key, value] of entries) wx.setStorageSync(key, value);
    return true;
  } catch (error) {
    console.error('Unable to persist device binding:', error);
    clearBinding();
    return false;
  }
}

export function getDeviceId() {
  const stored = readStored(STORAGE_KEYS.DEVICE_ID);
  if (typeof stored === 'string' && stored) return stored;

  const id = crypto.randomUUID();
  wx.setStorageSync(STORAGE_KEYS.DEVICE_ID, id);
  return id;
}

export function getBindingStatus() {
  const accessToken = readStored(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = readStored(STORAGE_KEYS.REFRESH_TOKEN);
  const accessExpiresAt = Number(readStored(STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT));
  const refreshExpiresAt = Number(readStored(STORAGE_KEYS.REFRESH_TOKEN_EXPIRES_AT));

  if (!accessToken || !refreshToken || !accessExpiresAt || !refreshExpiresAt) {
    clearBinding();
    return 'unbound';
  }

  const now = nowSeconds();
  if (now >= refreshExpiresAt) {
    clearBinding();
    return 'unbound';
  }
  if (now >= accessExpiresAt - TOKEN_REFRESH_BUFFER_SECONDS) return 'expired';
  return 'bound';
}

export { normalizeBindingCode, parseQrPayload };

export async function requestBinding(bindingCode, options = {}) {
  const normalizedCode = normalizeBindingCode(bindingCode);
  if (!normalizedCode) return { success: false, error: 'BINDING_CODE_INVALID' };

  let deviceId;
  try {
    deviceId = getDeviceId();
  } catch (error) {
    console.error('Unable to create device id:', error);
    return { success: false, error: 'STORAGE_ERROR' };
  }

  try {
    const res = await request({
      url: OAUTH_TOKEN_URL,
      method: 'POST',
      data: {
        grant_type: QR_BINDING_GRANT_TYPE,
        binding_code: normalizedCode,
        device_id: deviceId,
        device_name: options.deviceName || 'Rokid Glasses',
        device_type: options.deviceType || 'rokid-glasses'
      },
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      dataType: 'json'
    });

    if (res.statusCode === 200) {
      const bundle = validateTokenResponse(res.data);
      if (!bundle) return { success: false, error: 'INVALID_TOKEN_RESPONSE' };
      if (!writeTokenBundle(bundle)) return { success: false, error: 'STORAGE_ERROR' };
      return { success: true, bindingId: bundle.bindingId };
    }

    return {
      success: false,
      error: resolveTokenError(res.data, res.statusCode),
      statusCode: res.statusCode
    };
  } catch (error) {
    const message = error && error.errMsg ? error.errMsg : '';
    return {
      success: false,
      error: /timeout/i.test(message) ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR'
    };
  }
}

async function refreshAccessToken() {
  const refreshToken = readStored(STORAGE_KEYS.REFRESH_TOKEN);
  const refreshTokenExpiresAt = Number(readStored(STORAGE_KEYS.REFRESH_TOKEN_EXPIRES_AT));
  if (!refreshToken || !refreshTokenExpiresAt || nowSeconds() >= refreshTokenExpiresAt) {
    clearBinding();
    return null;
  }

  try {
    const res = await request({
      url: OAUTH_TOKEN_URL,
      method: 'POST',
      data: {
        grant_type: REFRESH_GRANT_TYPE,
        refresh_token: refreshToken
      },
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      dataType: 'json'
    });

    if (res.statusCode === 200) {
      const bundle = validateTokenResponse(res.data);
      if (!bundle) return null;
      // 兼容 Server 返回 rotation token，但保留初次绑定时的 30 天硬截止时间。
      if (!writeTokenBundle(bundle, { refreshTokenExpiresAt })) return null;
      return bundle.accessToken;
    }

    const errorCode = resolveTokenError(res.data, res.statusCode);
    if (shouldClearBindingAfterRefreshFailure(res.statusCode, errorCode)) clearBinding();
    return null;
  } catch (error) {
    // 网络抖动时保留本地凭据，避免把可恢复错误误判成解绑。
    return null;
  }
}

export async function getValidAccessToken() {
  const status = getBindingStatus();
  if (status === 'unbound') return null;
  if (status === 'bound') return readStored(STORAGE_KEYS.ACCESS_TOKEN) || null;
  return refreshAccessToken();
}

export function clearBinding() {
  removeStored(STORAGE_KEYS.BINDING_ID);
  removeStored(STORAGE_KEYS.ACCESS_TOKEN);
  removeStored(STORAGE_KEYS.REFRESH_TOKEN);
  removeStored(STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT);
  removeStored(STORAGE_KEYS.REFRESH_TOKEN_EXPIRES_AT);
}

export async function tryRefresh() {
  return Boolean(await refreshAccessToken());
}
