/** 1234567 -> "¥1,234,567" (マイナスは "-¥5,000") */
export function yen(amount: number): string {
  const n = Math.round(amount);
  const sign = n < 0 ? '-' : '';
  return `${sign}¥${Math.abs(n).toLocaleString('ja-JP')}`;
}

/** 記号なしのカンマ区切り */
export function num(amount: number): string {
  return Math.round(amount).toLocaleString('ja-JP');
}

/** 0.5934 -> 59 */
export function percent(ratio: number): number {
  return Math.round(ratio * 100);
}

/** 差額を "+¥1,200" / "-¥800" の形にする */
export function signedYen(amount: number): string {
  const n = Math.round(amount);
  if (n === 0) return '±¥0';
  return `${n > 0 ? '+' : '-'}¥${Math.abs(n).toLocaleString('ja-JP')}`;
}
