import { END_OF_MONTH } from '../types';

// ============================================================================
// 日付ユーティリティ
// アプリ内の日付は一貫して "YYYY-MM-DD" のローカル日付文字列で扱う。
// new Date('YYYY-MM-DD') は UTC 解釈されて日本時間で 1 日ずれるため、
// 文字列 <-> Date の変換は必ずこのファイルの関数を経由する。
// ============================================================================

/** ローカル日付として Date を作る */
export function localDate(year: number, month1: number, day: number): Date {
  return new Date(year, month1 - 1, day, 12, 0, 0, 0); // 正午基準で DST/丸め事故を避ける
}

/** "YYYY-MM-DD" -> Date */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return localDate(y, m, d);
}

/** Date -> "YYYY-MM-DD" */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Date -> "YYYY-MM" */
export function toMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" -> "YYYY-MM" */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function todayISO(today: Date = new Date()): string {
  return toISODate(today);
}

/** その年月の日数 */
export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/**
 * 締め日/支払日の指定値を、その月に実在する日に丸める。
 * END_OF_MONTH は月末、31 指定でも 2月なら 28/29 になる。
 */
export function resolveDayInMonth(year: number, month1: number, day: number): number {
  const last = daysInMonth(year, month1);
  if (day === END_OF_MONTH || day >= last) return last;
  return Math.max(1, day);
}

/** 年月に n ヶ月足す (1始まりの月で返す) */
export function addMonths(year: number, month1: number, n: number): { year: number; month1: number } {
  const total = year * 12 + (month1 - 1) + n;
  return { year: Math.floor(total / 12), month1: (total % 12) + 1 };
}

/** "YYYY-MM" に n ヶ月足す */
export function addMonthsToKey(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const r = addMonths(y, m, n);
  return `${r.year}-${String(r.month1).padStart(2, '0')}`;
}

/** 日付文字列の大小比較 (文字列比較で正しく動く形式なのでそのまま) */
export function isBefore(a: string, b: string): boolean {
  return a < b;
}

// --- 表示用フォーマット -----------------------------------------------------

export function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return `${y}年${m}月`;
}

export function formatShortDate(isoDate: string): string {
  const [, m, d] = isoDate.split('-').map(Number);
  return `${m}/${d}`;
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 「今日」「昨日」「9/8(月)」のような相対表記 */
export function formatRelativeDate(isoDate: string, today: Date = new Date()): string {
  const t = toISODate(today);
  if (isoDate === t) return '今日';

  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  if (isoDate === toISODate(yest)) return '昨日';

  const d = parseDate(isoDate);
  const sameYear = d.getFullYear() === today.getFullYear();
  const base = `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  return sameYear ? base : `${d.getFullYear()}/${base}`;
}

/** 月末までの残り日数 (今日を含む) */
export function daysLeftInMonth(today: Date = new Date()): number {
  const last = daysInMonth(today.getFullYear(), today.getMonth() + 1);
  return last - today.getDate() + 1;
}
