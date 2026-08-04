import wx from 'wx';
import {
  SERVER_BASE_URL,
  OAUTH_TOKEN_URL,
  QR_BINDING_GRANT_TYPE,
  REFRESH_GRANT_TYPE,
  QR_PAYLOAD_SCHEME,
  QR_PAYLOAD_HOST,
  STORAGE_KEYS,
  TOKEN_REFRESH_BUFFER_SECONDS
} from './config.js';

// ============================================================
// 内部工具：将 wx.request 包装为 Promise
// ============================================================

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      ...options,
      success: resolve,
      fail: reject
    });
  });
}

// ============================================================
// 设备 ID：首次生成 UUID v4 并持久化，后续读取
// ============================================================

export function getDeviceId() {
  let id = wx.getStorageSync(STORAGE_KEYS.DEVICE_ID);
  if (id) return id;
  id = crypto.randomUUID();
  wx.setStorageSync(STORAGE_KEYS.DEVICE_ID, id);
  return id;
}

// ============================================================
// 绑定状态：检查本地是否有完整且未过期的 binding 数据
// 返回 'bound' | 'unbound' | 'expired'
// ============================================================

export function getBindingStatus() {
  const accessToken = wx.getStorageSync(STORAGE_KEYS.ACCESS_TOKEN);
  const refreshToken = wx.getStorageSync(STORAGE_KEYS.REFRESH_TOKEN);
  const expiresAt = wx.getStorageSync(STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT);

  if (!accessToken || !refreshToken || !expiresAt) {
    return 'unbound';
  }

  const now = Math.floor(Date.now() / 1000);
  if (now >= expiresAt - TOKEN_REFRESH_BUFFER_SECONDS) {
    return 'expired';
  }

  return 'bound';
}

// ============================================================
// 解析二维码 payload：momentone://bind?code=xxx
// 返回 binding_code 或 null
// ============================================================

export function parseQrPayload(value) {
  if (typeof value !== 'string' || !value) return null;
  const prefix = QR_PAYLOAD_SCHEME + '://' + QR_PAYLOAD_HOST;
  if (!value.startsWith(prefix)) return null;
  const queryStart = value.indexOf('?');
  if (queryStart < 0) return null;
  const search = value.slice(queryStart + 1);
  // 手动解析 query string（AIUI 未确认 URLSearchParams）
  const pairs = search.split('&');
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    if (key === 'code') {
      const val = pair.slice(eq + 1);
      return val ? decodeURIComponent(val) : null;
    }
  }
  return null;
}

// ============================================================
// 请求绑定：用 binding_code 换 token
// 成功：存 binding_id + access_token + refresh_token + expires_at
// 返回 { success: true } 或 { success: false, error: 'ERROR_CODE' }
// ============================================================

export async function requestBinding(bindingCode, options = {}) {
  const deviceId = getDeviceId();
  const body = {
    grant_type: QR_BINDING_GRANT_TYPE,
    binding_code: bindingCode,
    device_id: deviceId,
    device_name: options.deviceName || 'Rokid Glasses',
    device_type: options.deviceType || 'rokid-glasses'
  };

  try {
    const res = await request({
      url: OAUTH_TOKEN_URL,
      method: 'POST',
      data: body,
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      dataType: 'json'
    });

    if (res.statusCode === 200 && res.data && res.data.access_token) {
      const data = res.data;
      const now = Math.floor(Date.now() / 1000);
      wx.setStorageSync(STORAGE_KEYS.BINDING_ID, data.binding_id);
      wx.setStorageSync(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      wx.setStorageSync(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
      wx.setStorageSync(
        STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT,
        now + (data.expires_in || 3600)
      );
      return { success: true };
    }

    // OAuth 错误响应
    const error = (res.data && (res.data.error || res.data.code)) || 'UNKNOWN';
    return { success: false, error };
  } catch (err) {
    return { success: false, error: 'NETWORK_ERROR' };
  }
}

// ============================================================
// 刷新 access_token：用 refresh_token 换新 token
// 成功：更新本地 token + expires_at，返回新 access_token
// 失败：清除本地 binding，返回 null
// ============================================================

async function refreshAccessToken() {
  const refreshToken = wx.getStorageSync(STORAGE_KEYS.REFRESH_TOKEN);
  if (!refreshToken) return null;

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

    if (res.statusCode === 200 && res.data && res.data.access_token) {
      const data = res.data;
      const now = Math.floor(Date.now() / 1000);
      wx.setStorageSync(STORAGE_KEYS.ACCESS_TOKEN, data.access_token);
      wx.setStorageSync(STORAGE_KEYS.REFRESH_TOKEN, data.refresh_token);
      wx.setStorageSync(
        STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT,
        now + (data.expires_in || 3600)
      );
      return data.access_token;
    }

    // refresh_token 失效（binding 已撤销 / refresh_token 过期）→ 清除本地
    clearBinding();
    return null;
  } catch (err) {
    return null;
  }
}

// ============================================================
// 获取有效 access_token：
// - 未过期 → 先向 Server 验证，有效则返回，无效则清除并返回 null
// - 已过期 → 尝试刷新，成功返回新 token，失败返回 null
// ============================================================

export async function getValidAccessToken() {
  const status = getBindingStatus();
  if (status === 'unbound') return null;
  if (status === 'bound') {
    const token = wx.getStorageSync(STORAGE_KEYS.ACCESS_TOKEN);
    // 向 Server 验证 token 是否真的有效（防止本地缓存与 Server 状态不一致）
    const valid = await verifyTokenWithServer(token);
    if (valid) return token;
    // Server 拒绝 → 清除本地绑定
    clearBinding();
    return null;
  }
  // expired → 尝试刷新
  return refreshAccessToken();
}

// ============================================================
// 向 Server 验证 access_token 是否有效
// 用 GET /v1/device/bindings 调一次需要鉴权的接口
// 200 → 有效，401/403 → 无效
// ============================================================

async function verifyTokenWithServer(token) {
  if (!token) return false;
  try {
    const res = await request({
      url: SERVER_BASE_URL + '/v1/device/bindings',
      method: 'GET',
      header: { 'Authorization': 'Bearer ' + token },
      dataType: 'json'
    });
    return res.statusCode === 200;
  } catch (err) {
    // 网络错误时保守起见返回 true，避免离线时无法使用
    return true;
  }
}

// ============================================================
// 清除本地所有 binding 相关数据
// ============================================================

export function clearBinding() {
  wx.removeStorageSync(STORAGE_KEYS.BINDING_ID);
  wx.removeStorageSync(STORAGE_KEYS.ACCESS_TOKEN);
  wx.removeStorageSync(STORAGE_KEYS.REFRESH_TOKEN);
  wx.removeStorageSync(STORAGE_KEYS.ACCESS_TOKEN_EXPIRES_AT);
}

// ============================================================
// 静默尝试刷新（welcome 页用）：成功返回 true，失败返回 false
// ============================================================

export async function tryRefresh() {
  const token = await refreshAccessToken();
  return !!token;
}
