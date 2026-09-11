import type { AppData, CreditCard, Expense, FixedExpense, FixedIncome } from '../types';
import { monthOf } from './date';
import { buildBillingCycles } from './creditCard';

// ============================================================================
// 予算計算
//
// このアプリでいちばん大事な数字「今月あといくら使えるか」を出す。
//
//   今月あと使えるお金
//     = 固定収入合計 − 固定費合計 − 今月の使用額 − 今月引き落とされるカード請求
//
// 「使用額」には固定費由来の支出を含めない。
// 固定収入 − 固定費 の時点で固定費は差し引かれているので、
// 家賃の支払いをここから引くと二重に引くことになるため。
//
// 「今月引き落とされるカード請求」は、過去の月に使ったぶんの引き落としだけを
// 対象にする。今月使った分（= すでに「今月の使用額」に入っている）まで
// 足すと二重計上になるため、請求サイクルの中身を利用日で振り分けて除く。
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
 * 指定月に口座から引き落とされるカード請求のうち、まだ「今月の使用額」に
 * 含まれていない分（= 過去の月に使って、今月引き落とされる分）を返す。
 * 同じ月内で使って同じ月内に引き落とされるカード（締め日が早いカード等）は
 * 使用額側ですでに数えているので、ここでは除いて二重計上を防ぐ。
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
      if (monthOf(cycle.paymentDate) !== month) continue;
      for (const e of cycle.expenses) {
        if (monthOf(e.date) !== month) total += e.amount;
      }
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
  /** 今月の使用額 (固定費由来は含まない) */
  spent: number;
  /** 今月引き落とされるカード請求のうち、過去月に使った分（使用額と二重計上しない） */
  cardPaymentDue: number;
  /** 今月あと使えるお金。マイナスなら使いすぎ */
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
  let fixedSpent = 0;
  let creditUsed = 0;
  let cashUsed = 0;
  const byPaymentMethod: Record<string, number> = {};
  const categoryMap = new Map<string, number>();

  for (const e of list) {
    if (countsTowardBudget(e)) spent += e.amount;
    else fixedSpent += e.amount;

    byPaymentMethod[e.paymentMethod] = (byPaymentMethod[e.paymentMethod] ?? 0) + e.amount;
    if (e.paymentMethod === 'credit') creditUsed += e.amount;
    if (e.paymentMethod === 'cash') cashUsed += e.amount;

    categoryMap.set(e.categoryId, (categoryMap.get(e.categoryId) ?? 0) + e.amount);
  }

  const cardPaymentDue = cardPaymentDueThisMonth(data.creditCards, data.expenses, month);
  const remaining = budget - spent - cardPaymentDue;
  const ratio = budget > 0 ? (spent + cardPaymentDue) / budget : 0;

  return {
    month,
    budget,
    spent,
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
