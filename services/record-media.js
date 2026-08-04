export const AUDIO_RECORDING_DURATION_MS = 8000;
export const VIDEO_RECORDING_SUPPORTED = false;

export function resolveRecordMediaChoice(input) {
  const text = String(input || '').trim();
  if (!text) return 'unknown';
  if (/^(取消|算了|不保存|放弃)[。！!，,\s]*$/.test(text)) return 'cancel';
  if (/重新拍|重拍|再拍一张|换一张/.test(text)) return 'retake';
  if (/录制视频|录视频|拍视频|视频/.test(text)) return 'video';
  if (/照片.*录音|录音.*照片|同时.*录音/.test(text)) return 'photo+audio';
  if (/只录音|录一段|开始录音|保存录音|用录音|语音形式/.test(text)) return 'audio';
  if (/不保存照片|不要照片|只保存文字|不要媒体/.test(text)) return 'text';
  if (/保存照片|使用照片|保留照片|就这样|确认保存|^保存$|^确定$|^可以$/.test(text)) return 'photo';
  return 'unknown';
}
