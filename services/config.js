// MomentOneServer 地址
export const SERVER_BASE_URL = 'https://moment-one-api.yuanshuai.fun';

// OAuth 2.1 Token 端点
export const OAUTH_TOKEN_URL = SERVER_BASE_URL + '/oauth/token';

// OAuth grant type
export const QR_BINDING_GRANT_TYPE = 'urn:momentone:oauth:grant-type:qr-binding';
export const REFRESH_GRANT_TYPE = 'refresh_token';

// 二维码 scheme
export const QR_PAYLOAD_SCHEME = 'momentone';
export const QR_PAYLOAD_HOST = 'bind';

// 本地存储 key（全部冻结，禁止运行时修改）
export const STORAGE_KEYS = Object.freeze({
  DEVICE_ID: 'deviceId',
  BINDING_ID: 'bindingId',
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  ACCESS_TOKEN_EXPIRES_AT: 'accessTokenExpiresAt'
});

// access_token 过期前提前刷新的缓冲时间（秒），避免临界过期
export const TOKEN_REFRESH_BUFFER_SECONDS = 60;
