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
  ACCESS_TOKEN_EXPIRES_AT: 'accessTokenExpiresAt',
  REFRESH_TOKEN_EXPIRES_AT: 'refreshTokenExpiresAt'
});

// access_token 过期前提前刷新的缓冲时间（秒），避免临界过期
export const TOKEN_REFRESH_BUFFER_SECONDS = 60;

// Glasses 端强制执行 refresh_token 30 天硬上限；刷新不得延长该截止时间。
export const REFRESH_TOKEN_HARD_TTL_SECONDS = 30 * 24 * 60 * 60;

// Server 未返回合法 expires_in 时的安全回退值。
export const TOKEN_DEFAULT_EXPIRES_IN_SECONDS = 60 * 60;

// 绑定和刷新请求不应无限占用页面交互。
export const BINDING_REQUEST_TIMEOUT_MS = 15_000;
