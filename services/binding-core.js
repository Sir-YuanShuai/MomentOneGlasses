import {
  QR_PAYLOAD_HOST,
  QR_PAYLOAD_SCHEME,
  TOKEN_DEFAULT_EXPIRES_IN_SECONDS,
} from './config.js';

const BINDING_CODE_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;

export function normalizeBindingCode(value) {
  if (typeof value !== 'string') return null;
  const code = value.trim();
  return BINDING_CODE_PATTERN.test(code) ? code : null;
}

export function parseQrPayload(value) {
  if (typeof value !== 'string') return null;
  const payload = value.trim();
  const prefix = `${QR_PAYLOAD_SCHEME}://${QR_PAYLOAD_HOST}?`;
  if (!payload.startsWith(prefix)) return null;

  const query = payload.slice(prefix.length);
  if (!query) return null;

  let bindingCode = null;
  for (const pair of query.split('&')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;

    let key;
    let decodedValue;
    try {
      key = decodeURIComponent(pair.slice(0, separator));
      decodedValue = decodeURIComponent(pair.slice(separator + 1));
    } catch {
      return null;
    }

    if (key !== 'code') continue;
    if (bindingCode !== null) return null;
    bindingCode = normalizeBindingCode(decodedValue);
    if (!bindingCode) return null;
  }

  return bindingCode;
}

export function resolveTokenError(data, statusCode) {
  const nestedError = data && typeof data.error === 'object' ? data.error : null;
  const candidates = [
    nestedError && nestedError.code,
    data && data.code,
    data && typeof data.error === 'string' ? data.error : '',
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().toUpperCase();
    }
  }

  if (statusCode === 408) return 'REQUEST_TIMEOUT';
  if (statusCode === 429) return 'RATE_LIMITED';
  if (statusCode >= 500) return 'SERVER_ERROR';
  if (statusCode === 401 || statusCode === 403) return 'TOKEN_REJECTED';
  if (statusCode >= 400) return 'INVALID_REQUEST';
  return 'UNKNOWN';
}

export function normalizeExpiresIn(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 60) {
    return TOKEN_DEFAULT_EXPIRES_IN_SECONDS;
  }
  return Math.floor(seconds);
}

export function validateTokenResponse(data) {
  if (!data || typeof data !== 'object') return null;
  if (typeof data.binding_id !== 'string' || !data.binding_id) return null;
  if (typeof data.access_token !== 'string' || !data.access_token) return null;
  if (typeof data.refresh_token !== 'string' || !data.refresh_token) return null;

  return {
    bindingId: data.binding_id,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: normalizeExpiresIn(data.expires_in),
  };
}

export function shouldClearBindingAfterRefreshFailure(statusCode, errorCode) {
  if (errorCode === 'REFRESH_TOKEN_INVALID' || errorCode === 'TOKEN_REJECTED') return true;
  return statusCode === 400 || statusCode === 401 || statusCode === 403;
}
