import type { AppData, FixedExpense, FixedIncome } from '../types';
import { END_OF_MONTH, WEEKDAYS_JA } from '../types';
import { daysInMonth, localDate, monthOf, resolveDayInMonth, toISODate } from './date';
import { summarizeCards } from './creditCard';

// ============================================================================
// スケジュール算出
//
// 指定した月（YYYY-MM）に発生する「予定」をすべて列挙する。
//   - クレジットカードの引き落とし（利用実績から締め日・支払日を計算）
//   - 固定費（毎月◯日 / 毎週◯曜）
//   - 固定収入（入金予定。表示専用）
//
// 実際の支出/収入レコードは作らない。カレンダー表示と予定サマリのための純粋関数。
// ============================================================================

export type ScheduleKind = 'card' | 'expense' | 'income';

export interface ScheduleEvent {
  /** YYYY-MM-DD */
  date: string;
  kind: ScheduleKind;
  /** カード名 / 固定費名 / 収入名 */
  label: string;
  /** 常に正の値。収入か支出かは kind で判断する */
  amount: number;
  /** 元になったカード / 固定費 / 固定収入の id */
  sourceId: string;
  /** 「毎週火曜」「確定」「未確定」など補足 */
  note?: string;
}

/** 周期の説明文（「毎月25日」「毎週火曜」） */
function freqNote(item: Pick<FixedExpense, 'freq' | 'paymentDay' | 'weekday'>): string {
  if (item.freq === 'weekly') {
    const w = item.weekday ?? 0;
    return `毎週${WEEKDAYS_JA[w]}曜`;
  }
  return item.paymentDay === END_OF_MONTH ? '毎月末' : `毎月${item.paymentDay}日`;
}

/** その月に item が発生する日をすべて返す（YYYY-MM-DD、昇順） */
function occurrencesInMonth(
  item: Pick<FixedExpense, 'freq' | 'paymentDay' | 'weekday'>,
  year: number,
  month1: number,
): string[] {
  if (item.freq === 'weekly') {
    const target = item.weekday ?? 0;
    const out: string[] = [];
    const last = daysInMonth(year, month1);
    for (let d = 1; d <= last; d++) {
      if (localDate(year, month1, d).getDay() === target) {
        out.push(toISODate(localDate(year, month1, d)));
      }
    }
    return out;
  }

  // monthly: 実在する日に丸めて 1 件
  const day = resolveDayInMonth(year, month1, item.paymentDay);
  return [toISODate(localDate(year, month1, day))];
}

/**
 * 指定月に発生する予定イベントを日付昇順で返す。
 * @param month "YYYY-MM"
 */
export function eventsInMonth(
  data: AppData,
  month: string,
  today: Date = new Date(),
): ScheduleEvent[] {
  const [year, month1] = month.split('-').map(Number);
  const events: ScheduleEvent[] = [];

  // --- クレジットカードの引き落とし ---
  const cards = summarizeCards(data.creditCards, data.expenses, today);
  for (const s of cards.summaries) {
    for (const cycle of s.cycles) {
      if (monthOf(cycle.paymentDate) !== month) continue;
      if (cycle.amount <= 0) continue;
      events.push({
        date: cycle.paymentDate,
        kind: 'card',
        label: s.card.name,
        amount: cycle.amount,
        sourceId: s.card.id,
        note: cycle.paid ? '引き落とし済み' : cycle.confirmed ? '確定' : '未確定',
      });
    }
  }

  // --- 固定費 ---
  for (const f of data.fixedExpenses) {
    if (!f.active) continue;
    for (const date of occurrencesInMonth(f, year, month1)) {
      events.push({
        date,
        kind: 'expense',
        label: f.name,
        amount: f.amount,
        sourceId: f.id,
        note: freqNote(f),
      });
    }
  }

  // --- 固定収入 ---
  for (const inc of data.fixedIncomes) {
    if (!inc.active) continue;
    for (const date of occurrencesInMonth(inc, year, month1)) {
      events.push({
        date,
        kind: 'income',
        label: inc.name,
        amount: inc.amount,
        sourceId: inc.id,
        note: freqNote(inc),
      });
    }
  }

  // 日付順。同日は カード → 支出 → 収入 の順で安定させる
  const order: Record<ScheduleKind, number> = { card: 0, expense: 1, income: 2 };
  return events.sort(
    (a, b) => a.date.localeCompare(b.date) || order[a.kind] - order[b.kind],
  );
}

/** イベント配列から「出ていくお金 / 入ってくるお金」の合計を出す */
export function scheduleTotals(events: ScheduleEvent[]): {
  outgoing: number;
  incoming: number;
} {
  let outgoing = 0;
  let incoming = 0;
  for (const e of events) {
    if (e.kind === 'income') incoming += e.amount;
    else outgoing += e.amount;
  }
  return { outgoing, incoming };
}

/** 1ヶ月あたりの固定収入合計（毎週◯円は月換算）。予算には使わない参考値 */
export function totalFixedIncomes(fixedIncomes: FixedIncome[]): number {
  return fixedIncomes
    .filter((i) => i.active)
    .reduce(
      (sum, i) => sum + (i.freq === 'weekly' ? Math.round((i.amount * 52) / 12) : i.amount),
      0,
    );
}
