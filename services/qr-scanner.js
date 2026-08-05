import { normalizeBindingCode, parseQrPayload } from './binding-core.js';

export function toImageBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function readUint32BigEndian(bytes, offset) {
  return (
    bytes[offset] * 0x1000000
    + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100
    + bytes[offset + 3]
  );
}

function parsePngSize(bytes) {
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((value, index) => bytes[index] === value)) return null;
  const width = readUint32BigEndian(bytes, 16);
  const height = readUint32BigEndian(bytes, 20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function parseJpegSize(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 3 < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    if (offset + 1 >= bytes.length) return null;

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda || offset + 1 >= bytes.length) return null;

    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    const isStartOfFrame = (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    );
    if (isStartOfFrame) {
      if (segmentLength < 7) return null;
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return width > 0 && height > 0 ? { width, height } : null;
    }

    offset += segmentLength;
  }

  return null;
}

export function parseImageSize(data) {
  const bytes = toImageBytes(data);
  if (!bytes) return null;
  return parsePngSize(bytes) || parseJpegSize(bytes);
}

export function findBindingCode(detections) {
  if (!Array.isArray(detections)) return null;
  for (const detection of detections) {
    const value = detection && typeof detection.rawValue === 'string'
      ? detection.rawValue
      : '';
    const code = parseQrPayload(value);
    if (code) return code;
  }
  return null;
}

export function extractSpokenBindingCode(transcript) {
  const text = String(transcript || '').trim();
  if (!text) return null;

  const direct = normalizeBindingCode(text);
  if (direct) return direct;

  const patterns = [
    /绑定码[是为：:\s]+([A-Za-z0-9_-]+)/i,
    /code\s+is\s+([A-Za-z0-9_-]+)/i,
    /码[是为：:\s]+([A-Za-z0-9_-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const code = match && normalizeBindingCode(match[1]);
    if (code) return code;
  }

  return normalizeBindingCode(text.replace(/[\s，。、！？.,!?]/g, ''));
}
