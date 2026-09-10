import type { AppData, Budget, Expense, FixedExpense, Settings } from '../types';
import { monthOf } from './date';

// ============================================================================
// 予算計算
//
// このアプリでいちばん大事な数字「今月あといくら使えるか」を出す。
//
// 予算の決め方は 2 通り:
//   auto   : 手取り - 有効な固定費合計  (例: 250,000 - 170,000 = 80,000)
//   manual : ユーザーが直接指定した金額
// どちらの場合も、その月だけ上書きしたい場合は Budget レコードが最優先。
//
// 「使用額」には固定費由来の支出を含めない。
// 予算はすでに固定費を差し引いた「自由に使えるお金」なので、
// 家賃をここから引くと二重に引くことになるため。
// ============================================================================

/** 有効な固定費の合計 */
export function totalFixedExpenses(fixedExpenses: FixedExpense[]): number {
  return fixedExpenses.filter((f) => f.active).reduce((sum, f) => sum + f.amount, 0);
}

/** 指定月の予算額を求める */
export function getBudgetForMonth(
  month: string,
  settings: Settings,
  budgets: Budget[],
  fixedExpenses: FixedExpense[],
): number {
  const override = budgets.find((b) => b.month === month);
  if (override) return override.amount;

  if (settings.budgetMode === 'auto') {
    return Math.max(0, settings.income - totalFixedExpenses(fixedExpenses));
  }
  return settings.defaultBudget;
}

/** その支出が「今月あと使える金額」から引かれるか */
export function countsTowardBudget(e: Expense): boolean {
  return !e.excludeFromBudget && !e.fixedExpenseId;
}

/** 指定月の支出を取り出す */
export function expensesInMonth(expenses: Expense[], month: string): Expense[] {
  return expenses.filter((e) => monthOf(e.date) === month);
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
  /** 今月の予算 (自由に使えるお金) */
  budget: number;
  /** 今月の使用額 (予算対象のみ。固定費は含まない) */
  spent: number;
  /** 今月あと使える金額。マイナスなら予算超過 */
  remaining: number;
  /** 使用率 0-∞ (予算 0 のときは 0) */
  ratio: number;
  /** 予算超過額 (超過していなければ 0) */
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
  const budget = getBudgetForMonth(month, data.settings, data.budgets, data.fixedExpenses);

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

  const remaining = budget - spent;
  const ratio = budget > 0 ? spent / budget : 0;

  return {
    month,
    budget,
    spent,
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
  for (const b of data.budgets) set.add(b.month);

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
