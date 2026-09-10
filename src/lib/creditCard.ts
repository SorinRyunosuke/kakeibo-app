import type { CreditCard, Expense } from '../types';
import { addMonths, parseDate, resolveDayInMonth, toISODate, todayISO } from './date';

// ============================================================================
// クレジットカードの締め日・支払日ロジック
//
// このアプリの中核。「9月に使ったお金」と「次の引き落とし額」を混同しないため、
// 支出 1 件ごとに「どの請求サイクルに入るか」を厳密に決める。
//
// 例) 楽天カード = 月末締め / 翌月27日払い (closingDay=末日, offset=1, paymentDay=27)
//     9/5 の利用  -> 9/30 締め -> 10/27 引き落とし
//     10/1 の利用 -> 10/31 締め -> 11/27 引き落とし
// ============================================================================

export interface BillingCycle {
  /** サイクルを一意に識別するキー (= 締め日) */
  key: string;
  /** このサイクルの利用対象期間の開始日 (前回締め日の翌日) YYYY-MM-DD */
  periodStart: string;
  /** 締め日 YYYY-MM-DD */
  closingDate: string;
  /** 引き落とし日 YYYY-MM-DD */
  paymentDate: string;
  /** このサイクルの合計利用額 */
  amount: number;
  /** このサイクルに属する支出 */
  expenses: Expense[];
  /** 締め日を過ぎており、金額が確定しているか */
  confirmed: boolean;
  /** すでに引き落とし日を過ぎているか */
  paid: boolean;
}

/**
 * 支出日から、その支出が属する請求サイクル (締め日・支払日) を求める。
 */
export function getBillingCycleFor(
  card: Pick<CreditCard, 'closingDay' | 'paymentDay' | 'paymentMonthOffset'>,
  expenseDate: string,
): { closingDate: string; paymentDate: string } {
  const d = parseDate(expenseDate);
  const year = d.getFullYear();
  const month1 = d.getMonth() + 1;
  const day = d.getDate();

  // その月の締め日 (月末締めや 2月などを考慮して実在する日に丸める)
  const closingDayThisMonth = resolveDayInMonth(year, month1, card.closingDay);

  // 締め日当日までの利用はその月の締めに含める。締め日翌日以降は翌月締め。
  let closeY = year;
  let closeM = month1;
  if (day > closingDayThisMonth) {
    const next = addMonths(year, month1, 1);
    closeY = next.year;
    closeM = next.month1;
  }
  const closeD = resolveDayInMonth(closeY, closeM, card.closingDay);

  // 締め月 + offset ヶ月後が引き落とし月
  const pay = addMonths(closeY, closeM, card.paymentMonthOffset);
  const payD = resolveDayInMonth(pay.year, pay.month1, card.paymentDay);

  return {
    closingDate: toISODate(new Date(closeY, closeM - 1, closeD, 12)),
    paymentDate: toISODate(new Date(pay.year, pay.month1 - 1, payD, 12)),
  };
}

/**
 * 締め日から、その請求サイクルの開始日 (前回締め日の翌日) を求める。
 * 「9/1〜9/30 利用分」のように対象期間を明細に出すために使う。
 */
export function getCyclePeriodStart(
  card: Pick<CreditCard, 'closingDay'>,
  closingDate: string,
): string {
  const d = parseDate(closingDate);
  const prev = addMonths(d.getFullYear(), d.getMonth() + 1, -1);
  const prevClosingDay = resolveDayInMonth(prev.year, prev.month1, card.closingDay);
  // 日に +1 して翌日にする (月をまたぐ場合も Date が繰り上げてくれる)
  return toISODate(new Date(prev.year, prev.month1 - 1, prevClosingDay + 1, 12));
}

/**
 * 1 枚のカードについて、支出を請求サイクルごとに集計する。
 * 戻り値は引き落とし日の昇順。
 */
export function buildBillingCycles(
  card: CreditCard,
  expenses: Expense[],
  today: Date = new Date(),
): BillingCycle[] {
  const t = todayISO(today);
  const map = new Map<string, BillingCycle>();

  for (const e of expenses) {
    if (e.paymentMethod !== 'credit' || e.creditCardId !== card.id) continue;
    const { closingDate, paymentDate } = getBillingCycleFor(card, e.date);
    let cycle = map.get(closingDate);
    if (!cycle) {
      cycle = {
        key: closingDate,
        periodStart: getCyclePeriodStart(card, closingDate),
        closingDate,
        paymentDate,
        amount: 0,
        expenses: [],
        confirmed: closingDate < t, // 締め日を過ぎていれば確定
        paid: paymentDate < t, // 引き落とし日を過ぎていれば支払済み
      };
      map.set(closingDate, cycle);
    }
    cycle.amount += e.amount;
    cycle.expenses.push(e);
  }

  return [...map.values()].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
}

export interface CardSummary {
  card: CreditCard;
  /** 支払済みも含む全サイクル (引き落とし日昇順)。明細画面で過去も辿れるようにする */
  cycles: BillingCycle[];
  /** 未引き落としのサイクル (引き落とし日昇順) */
  upcoming: BillingCycle[];
  /** 次回引き落とし */
  next: BillingCycle | null;
  /** 次々回引き落とし */
  following: BillingCycle | null;
  /** 未払いのうち、締め日を過ぎて金額が確定している分 */
  confirmedTotal: number;
  /** 未払いのうち、まだ締め日前で今後増える可能性がある分 */
  unconfirmedTotal: number;
  /** カード未払い残高 (確定 + 未確定) */
  unpaidTotal: number;
}

/** 1 枚のカードのサマリを作る */
export function summarizeCard(
  card: CreditCard,
  expenses: Expense[],
  today: Date = new Date(),
): CardSummary {
  const cycles = buildBillingCycles(card, expenses, today);
  const upcoming = cycles.filter((c) => !c.paid);

  let confirmedTotal = 0;
  let unconfirmedTotal = 0;
  for (const c of upcoming) {
    if (c.confirmed) confirmedTotal += c.amount;
    else unconfirmedTotal += c.amount;
  }

  return {
    card,
    cycles,
    upcoming,
    next: upcoming[0] ?? null,
    following: upcoming[1] ?? null,
    confirmedTotal,
    unconfirmedTotal,
    unpaidTotal: confirmedTotal + unconfirmedTotal,
  };
}

export interface CardsOverview {
  summaries: CardSummary[];
  /** 全カードの次回引き落とし合計 */
  nextPaymentTotal: number;
  /** 全カードの未払いのうち、締め日を過ぎて確定した分 */
  confirmedTotal: number;
  /** 全カードの未払いのうち、まだ締め日前で今後増える分 */
  unconfirmedTotal: number;
  /** 全カードの未払い残高合計 */
  unpaidTotal: number;
  /** 直近の引き落とし日 (全カード中いちばん early なもの) */
  nearestPaymentDate: string | null;
}

/** 全カードを横断したサマリ */
export function summarizeCards(
  cards: CreditCard[],
  expenses: Expense[],
  today: Date = new Date(),
): CardsOverview {
  const summaries = cards
    .filter((c) => !c.archived)
    .map((c) => summarizeCard(c, expenses, today));

  let nextPaymentTotal = 0;
  let confirmedTotal = 0;
  let unconfirmedTotal = 0;
  let nearestPaymentDate: string | null = null;

  for (const s of summaries) {
    confirmedTotal += s.confirmedTotal;
    unconfirmedTotal += s.unconfirmedTotal;
    if (s.next) {
      nextPaymentTotal += s.next.amount;
      if (!nearestPaymentDate || s.next.paymentDate < nearestPaymentDate) {
        nearestPaymentDate = s.next.paymentDate;
      }
    }
  }

  return {
    summaries,
    nextPaymentTotal,
    confirmedTotal,
    unconfirmedTotal,
    unpaidTotal: confirmedTotal + unconfirmedTotal,
    nearestPaymentDate,
  };
}

/** 締め日・支払日を「月末締め 翌月27日払い」のような文言にする */
export function describeCardCycle(card: CreditCard): string {
  const close = card.closingDay === 99 ? '月末' : `${card.closingDay}日`;
  const pay = card.paymentDay === 99 ? '月末' : `${card.paymentDay}日`;
  const when = card.paymentMonthOffset === 0 ? '当月' : card.paymentMonthOffset === 1 ? '翌月' : '翌々月';
  return `${close}締め ${when}${pay}払い`;
}
