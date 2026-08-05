import jsQR from 'jsqr';

export function decodeQrPixels(data, width, height) {
  if (!data || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const pixels = data instanceof Uint8ClampedArray
    ? data
    : data instanceof ArrayBuffer
      ? new Uint8ClampedArray(data)
      : ArrayBuffer.isView(data)
        ? new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
        : null;
  if (!pixels || pixels.byteLength < width * height * 4) return null;

  const result = jsQR(pixels, width, height, { inversionAttempts: 'attemptBoth' });
  if (!result || typeof result.data !== 'string' || !result.data) return null;
  return result.data;
}
