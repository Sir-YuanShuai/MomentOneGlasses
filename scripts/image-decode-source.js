import jpeg from 'jpeg-js';
import UPNG from 'upng-js';

function toBytes(data) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function hasPngSignature(bytes) {
  return bytes.length >= 8
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
}

function hasJpegSignature(bytes) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

export function decodeCameraImage(data, mimeType = '') {
  const bytes = toBytes(data);
  if (!bytes || bytes.byteLength === 0) return null;
  const mime = String(mimeType || '').toLowerCase();
  try {
    if (mime.includes('png') || hasPngSignature(bytes)) {
      const source = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const image = UPNG.decode(source);
      const rgba = UPNG.toRGBA8(image)[0];
      if (!rgba || !image.width || !image.height) return null;
      return { width: image.width, height: image.height, data: rgba };
    }
    if (mime.includes('jpeg') || mime.includes('jpg') || hasJpegSignature(bytes)) {
      const image = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true });
      if (!image || !image.width || !image.height || !image.data) return null;
      return { width: image.width, height: image.height, data: image.data };
    }
  } catch (error) {
    console.warn('[moment-one:binding-scan] image decode failed', {
      mimeType: mimeType || '', byteLength: bytes.byteLength, message: error && error.message
    });
  }
  return null;
}
