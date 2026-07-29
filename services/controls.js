export const CONTROL = Object.freeze({
  BACK: 'back',
  ACTIVATE: 'activate',
  PREVIOUS: 'previous',
  NEXT: 'next'
});

export function resolveControl(code) {
  switch (code) {
    case 'Backspace':
    case 'Escape':
      return CONTROL.BACK;
    case 'Enter':
      return CONTROL.ACTIVATE;
    case 'ArrowUp':
      return CONTROL.PREVIOUS;
    case 'ArrowDown':
      return CONTROL.NEXT;
    default:
      return '';
  }
}

export function moveFocus(current, total, delta) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  const normalizedCurrent = Number.isFinite(current) ? current : 0;
  return (normalizedCurrent + delta + total) % total;
}
