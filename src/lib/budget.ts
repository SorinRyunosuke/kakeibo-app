import type { AppData, CreditCard, Expense, FixedExpense, FixedIncome } from '../types';
import { monthOf } from './date';
import { buildBillingCycles } from './creditCard';

// ============================================================================
// 予算計算
//
// このアプリでいちばん大事な数字「今月あといくら使えるか」を出す。
//
//   今月あと使えるお金
//     = 固定収入合計 − 固定費合計 − 現金/口座払いの使用額 − 今月引き落とされるカード請求
//
// 「使用額」には固定費由来の支出を含めない。
// 固定収入 − 固定費 の時点で固定費は差し引かれているので、
// 家賃の支払いをここから引くと二重に引くことになるため。
//
// クレジット払いは「使った日」ではなく「引き落とし日」で家計から引く（現金主義）。
// カードで買った瞬間はまだ口座からお金が出ていないので、その場では
// 「あと使えるお金」を減らさず、実際に引き落とされる月にだけ全額を反映する。
// （以前は使った月にも即減算していたが、これだと同じ支出が「使った月」と
// 「引き落とし月」の両方で「あと使えるお金」を削ってしまい、実際の現金の
// 動き以上に2重にマイナスになっていた。）
//
// なお「今月の使用額(spent)」「カテゴリ別内訳」などは、これとは別の
// 「今月何にいくら使ったか」という発生ベースの集計として、クレジット払いも
// 含めたまま残す。「あと使えるお金」と「今月の使用額」が一致しないのは、
// 目的の違う2つの数字だからで、意図した仕様。
// ============================================================================

/** 毎週◯円 → 1ヶ月あたりに換算（×52/12） */
function toMonthly(amount: number, freq: 'monthly' | 'weekly'): number {
  return freq === 'weekly' ? Math.round((amount * 52) / 12) : amount;
}

/** 固定費 1 件の「1ヶ月あたり」の金額 */
export function monthlyAmountOf(f: Pick<FixedExpense, 'amount' | 'freq'>): number {
  return toMonthly(f.amount, f.freq);
}

/** 有効な固定費の月換算合計 */
export function totalFixedExpenses(fixedExpenses: FixedExpense[]): number {
  return fixedExpenses
    .filter((f) => f.active)
    .reduce((sum, f) => sum + monthlyAmountOf(f), 0);
}

/** 有効な固定収入の月換算合計 */
export function totalFixedIncomes(fixedIncomes: FixedIncome[]): number {
  return fixedIncomes
    .filter((i) => i.active)
    .reduce((sum, i) => sum + toMonthly(i.amount, i.freq), 0);
}

/** 今月あと使えるお金の元になる「固定収入 − 固定費」（マイナスにはしない） */
export function getFreeToSpend(
  fixedIncomes: FixedIncome[],
  fixedExpenses: FixedExpense[],
): number {
  return Math.max(0, totalFixedIncomes(fixedIncomes) - totalFixedExpenses(fixedExpenses));
}

/** その支出が「今月あと使える金額」から引かれるか */
export function countsTowardBudget(e: Expense): boolean {
  return !e.excludeFromBudget && !e.fixedExpenseId;
}

/** 指定月の支出を取り出す */
export function expensesInMonth(expenses: Expense[], month: string): Expense[] {
  return expenses.filter((e) => monthOf(e.date) === month);
}

/**
 * 指定月に口座から引き落とされるカード請求の合計。
 * クレジット払いは「あと使えるお金」からは使用額として引かず、ここでだけ
 * （実際に引き落とされる月に）全額を反映するので、使用日は問わず全部足す。
 */
export function cardPaymentDueThisMonth(
  cards: CreditCard[],
  expenses: Expense[],
  month: string,
): number {
  let total = 0;
  for (const card of cards) {
    if (card.archived) continue;
    for (const cycle of buildBillingCycles(card, expenses)) {
      if (monthOf(cycle.paymentDate) === month) total += cycle.amount;
    }
  }
  return total;
}

export type WarningLevel = 'safe' | 'notice' | 'warning' | 'danger' | 'over';

/** 使用率から警告レベルを決める */
export function warningLevelOf(ratio: number): WarningLevel {
  if (ratio >= 1) return 'over';
  if (ratio >= 0.9) return 'danger';
  if (ratio >= 0.7) return 'warning';
  if (ratio >= 0.5) return 'notice';
  return 'safe';
}

export interface MonthSummary {
  month: string;
  /** 今月の自由に使えるお金 = 固定収入 − 固定費 */
  budget: number;
  /** 今月の使用額 (固定費由来は含まない・発生ベースでクレジット払いも含む) */
  spent: number;
  /** spent のうちクレジット払いを除いた分。「あと使えるお金」の計算はこちらを使う */
  nonCreditSpent: number;
  /** 今月引き落とされるカード請求の合計（クレジット払いは使用額側では引かず、こちらだけで計算する） */
  cardPaymentDue: number;
  /** 今月あと使えるお金。マイナスなら使いすぎ。クレジットは引き落とし日で計算する現金主義 */
  remaining: number;
  /** 使用率 0-∞ (budget 0 のときは 0) */
  ratio: number;
  /** 使いすぎ額 (超過していなければ 0) */
  overspend: number;
  warning: WarningLevel;
  /** 今月に計上した固定費の合計 (実際に登録された支出のうち固定費由来) */
  fixedSpent: number;
  /** 総支出 = spent + fixedSpent */
  total: number;
  /** 支払方法別の内訳 */
  byPaymentMethod: Record<string, number>;
  /** カテゴリ別の内訳 (金額降順) */
  byCategory: { categoryId: string; amount: number }[];
  /** 今月のカード利用額 (引き落とし日ではなく利用日ベース) */
  creditUsed: number;
  /** 今月の現金利用額 */
  cashUsed: number;
  expenses: Expense[];
}

/** 指定月のサマリを作る。ダッシュボード・分析・履歴すべてがこれを使う */
export function summarizeMonth(data: AppData, month: string): MonthSummary {
  const list = expensesInMonth(data.expenses, month);
  const budget = getFreeToSpend(data.fixedIncomes, data.fixedExpenses);

  let spent = 0;
  // 「あと使えるお金」の計算だけに使う。クレジット払いは含めない（引き落とし日で別に計算するため）
  let nonCreditSpent = 0;
  let fixedSpent = 0;
  let creditUsed = 0;
  let cashUsed = 0;
  const byPaymentMethod: Record<string, number> = {};
  const categoryMap = new Map<string, number>();

  for (const e of list) {
    if (countsTowardBudget(e)) {
      spent += e.amount;
      if (e.paymentMethod !== 'credit') nonCreditSpent += e.amount;
    } else {
      fixedSpent += e.amount;
    }

    byPaymentMethod[e.paymentMethod] = (byPaymentMethod[e.paymentMethod] ?? 0) + e.amount;
    if (e.paymentMethod === 'credit') creditUsed += e.amount;
    if (e.paymentMethod === 'cash') cashUsed += e.amount;

    categoryMap.set(e.categoryId, (categoryMap.get(e.categoryId) ?? 0) + e.amount);
  }

  const cardPaymentDue = cardPaymentDueThisMonth(data.creditCards, data.expenses, month);
  const remaining = budget - nonCreditSpent - cardPaymentDue;
  const ratio = budget > 0 ? (nonCreditSpent + cardPaymentDue) / budget : 0;

  return {
    month,
    budget,
    spent,
    nonCreditSpent,
    cardPaymentDue,
    remaining,
    ratio,
    overspend: remaining < 0 ? -remaining : 0,
    warning: warningLevelOf(ratio),
    fixedSpent,
    total: spent + fixedSpent,
    byPaymentMethod,
    byCategory: [...categoryMap.entries()]
      .map(([categoryId, amount]) => ({ categoryId, amount }))
      .sort((a, b) => b.amount - a.amount),
    creditUsed,
    cashUsed,
    expenses: list,
  };
}

/** 支出が存在する月 + 直近数ヶ月を新しい順で返す */
export function listMonths(data: AppData, currentMonth: string, minCount = 6): string[] {
  const set = new Set<string>(data.expenses.map((e) => monthOf(e.date)));
  set.add(currentMonth);

  const sorted = [...set].sort((a, b) => b.localeCompare(a));
  if (sorted.length >= minCount) return sorted;

  // 履歴が少ないうちは直近 minCount ヶ月を埋める
  const [y, m] = currentMonth.split('-').map(Number);
  const filled = new Set(sorted);
  for (let i = 0; i < minCount; i++) {
    const total = y * 12 + (m - 1) - i;
    const yy = Math.floor(total / 12);
    const mm = (total % 12) + 1;
    filled.add(`${yy}-${String(mm).padStart(2, '0')}`);
  }
  return [...filled].sort((a, b) => b.localeCompare(a));
}

/** 1日あたりあと使える金額 (月末までの残り日数で割る) */
export function dailyAllowance(remaining: number, daysLeft: number): number {
  if (daysLeft <= 0) return remaining;
  return Math.floor(remaining / daysLeft);
}
