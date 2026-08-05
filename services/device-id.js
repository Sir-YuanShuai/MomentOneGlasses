import runtimeCrypto from 'crypto';

function fallbackUuidV4() {
  const bytes = new Uint8Array(16);
  let timestamp = Date.now();
  for (let index = 0; index < bytes.length; index += 1) {
    const random = Math.floor(Math.random() * 256);
    const timeByte = timestamp & 0xff;
    bytes[index] = random ^ timeByte;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join('')
  ].join('-');
}

export function createDeviceId() {
  if (runtimeCrypto && typeof runtimeCrypto.randomUUID === 'function') {
    return runtimeCrypto.randomUUID();
  }
  const globalCrypto = globalThis && globalThis.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  console.warn('[moment-one:binding] crypto.randomUUID unavailable; using local UUID v4 fallback');
  return fallbackUuidV4();
}
