import { describe, expect, it } from 'vitest';
import { summarizeMonth, warningLevelOf } from '../budget';
import { createEmptyData } from '../../storage/schema';
import type { AppData, Expense } from '../../types';

function dataWith(spend: number[], budget = 80000): AppData {
  const data = createEmptyData();
  data.settings = {
    budgetMode: 'manual',
    defaultBudget: budget,
    alerts: { at70: true, at90: true, at100: true },
  };
  data.expenses = spend.map(
    (amount, i): Expense => ({
      id: `e${i}`,
      amount,
      date: `2026-09-0${(i % 9) + 1}`,
      categoryId: 'cat_food',
      paymentMethod: 'cash',
      createdAt: '2026-09-01T00:00:00.000Z',
    }),
  );
  return data;
}

describe('ケース1-3: 今月あと使える金額', () => {
  it('ケース1: 予算80,000 / 支出20,000 -> あと60,000', () => {
    const s = summarizeMonth(dataWith([20000]), '2026-09');
    expect(s.budget).toBe(80000);
    expect(s.spent).toBe(20000);
    expect(s.remaining).toBe(60000);
    expect(s.overspend).toBe(0);
  });

  it('ケース2: 予算80,000 / 支出79,000 -> あと1,000 (使用率98% = danger)', () => {
    const s = summarizeMonth(dataWith([79000]), '2026-09');
    expect(s.remaining).toBe(1000);
    expect(s.warning).toBe('danger');
  });

  it('ケース3: 予算80,000 / 支出85,000 -> -5,000 で超過が分かる', () => {
    const s = summarizeMonth(dataWith([85000]), '2026-09');
    expect(s.remaining).toBe(-5000);
    expect(s.overspend).toBe(5000);
    expect(s.warning).toBe('over');
  });

  it('複数件の支出が合算される', () => {
    const s = summarizeMonth(dataWith([18200, 9800, 7500, 5320, 6500]), '2026-09');
    expect(s.spent).toBe(47320);
    expect(s.remaining).toBe(32680);
  });

  it('別の月の支出は today の月に混ざらない', () => {
    const data = dataWith([20000]);
    data.expenses.push({
      id: 'x',
      amount: 999999,
      date: '2026-08-15',
      categoryId: 'cat_food',
      paymentMethod: 'cash',
      createdAt: '',
    });
    expect(summarizeMonth(data, '2026-09').spent).toBe(20000);
  });
});

describe('予算モード auto: 固定収入 - 固定費', () => {
  const autoSettings = {
    budgetMode: 'auto' as const,
    defaultBudget: 0,
    alerts: { at70: true, at90: true, at100: true },
  };

  it('固定収入250,000 / 固定費170,000 -> 予算80,000', () => {
    const data = createEmptyData();
    data.settings = autoSettings;
    data.fixedIncomes = [
      { id: 'i1', name: '給料', amount: 250000, freq: 'monthly', paymentDay: 25, active: true },
    ];
    data.fixedExpenses = [
      { id: 'f1', name: '家賃', amount: 120000, categoryId: 'cat_rent', freq: 'monthly', paymentDay: 27, paymentMethod: 'bank', active: true },
      { id: 'f2', name: '携帯', amount: 8000, categoryId: 'cat_comm', freq: 'monthly', paymentDay: 10, paymentMethod: 'credit', active: true },
      { id: 'f3', name: '光熱費', amount: 42000, categoryId: 'cat_utility', freq: 'monthly', paymentDay: 5, paymentMethod: 'bank', active: true },
      { id: 'f4', name: '解約済サブスク', amount: 50000, categoryId: 'cat_subsc', freq: 'monthly', paymentDay: 1, paymentMethod: 'credit', active: false },
    ];
    expect(summarizeMonth(data, '2026-09').budget).toBe(80000);
  });

  it('毎週の固定収入・固定費はどちらも月換算（×52/12）される', () => {
    const data = createEmptyData();
    data.settings = autoSettings;
    // 毎週70,000円 → 月 303,333円
    data.fixedIncomes = [
      { id: 'i1', name: 'バイト', amount: 70000, freq: 'weekly', paymentDay: 1, weekday: 5, active: true },
    ];
    // 毎週3,000円 → 月 13,000円（3000 * 52 / 12 = 13000）
    data.fixedExpenses = [
      { id: 'w1', name: '習い事', amount: 3000, categoryId: 'cat_hobby', freq: 'weekly', paymentDay: 1, weekday: 2, paymentMethod: 'cash', active: true },
    ];
    expect(summarizeMonth(data, '2026-09').budget).toBe(Math.round((70000 * 52) / 12) - 13000);
  });

  it('固定費由来の支出は「あと使える金額」から引かれない (二重計上の防止)', () => {
    const data = createEmptyData();
    data.settings = autoSettings;
    data.fixedIncomes = [
      { id: 'i1', name: '給料', amount: 250000, freq: 'monthly', paymentDay: 25, active: true },
    ];
    data.fixedExpenses = [
      { id: 'f1', name: '家賃', amount: 170000, categoryId: 'cat_rent', freq: 'monthly', paymentDay: 27, paymentMethod: 'bank', active: true },
    ];
    data.expenses = [
      { id: 'e1', amount: 170000, date: '2026-09-27', categoryId: 'cat_rent', paymentMethod: 'bank', fixedExpenseId: 'f1', createdAt: '' },
      { id: 'e2', amount: 5000, date: '2026-09-03', categoryId: 'cat_food', paymentMethod: 'cash', createdAt: '' },
    ];
    const s = summarizeMonth(data, '2026-09');
    expect(s.budget).toBe(80000);
    expect(s.spent).toBe(5000); // 家賃は含まない
    expect(s.remaining).toBe(75000);
    expect(s.fixedSpent).toBe(170000);
    expect(s.total).toBe(175000); // 総支出には含む
  });

  it('月ごとの Budget 上書きが最優先される', () => {
    const data = dataWith([10000]);
    data.budgets = [{ id: 'b1', month: '2026-09', amount: 50000 }];
    expect(summarizeMonth(data, '2026-09').remaining).toBe(40000);
  });
});

describe('警告レベル', () => {
  it.each([
    [0.0, 'safe'],
    [0.49, 'safe'],
    [0.5, 'notice'],
    [0.7, 'warning'],
    [0.9, 'danger'],
    [1.0, 'over'],
    [1.5, 'over'],
  ] as const)('使用率 %s -> %s', (ratio, level) => {
    expect(warningLevelOf(ratio)).toBe(level);
  });
});

describe('内訳の集計', () => {
  it('カテゴリ別は金額降順で返る', () => {
    const data = createEmptyData();
    data.settings.defaultBudget = 80000;
    data.expenses = [
      { id: '1', amount: 5000, date: '2026-09-01', categoryId: 'cat_food', paymentMethod: 'cash', createdAt: '' },
      { id: '2', amount: 9000, date: '2026-09-02', categoryId: 'cat_hobby', paymentMethod: 'cash', createdAt: '' },
      { id: '3', amount: 3000, date: '2026-09-03', categoryId: 'cat_food', paymentMethod: 'cash', createdAt: '' },
    ];
    const s = summarizeMonth(data, '2026-09');
    expect(s.byCategory).toEqual([
      { categoryId: 'cat_food', amount: 8000 },
      { categoryId: 'cat_hobby', amount: 9000 },
    ].sort((a, b) => b.amount - a.amount));
    expect(s.byCategory[0].categoryId).toBe('cat_hobby');
  });

  it('現金・カードの利用額が分かれて集計される', () => {
    const data = createEmptyData();
    data.expenses = [
      { id: '1', amount: 5000, date: '2026-09-01', categoryId: 'cat_food', paymentMethod: 'cash', createdAt: '' },
      { id: '2', amount: 12000, date: '2026-09-02', categoryId: 'cat_hobby', paymentMethod: 'credit', creditCardId: 'c1', createdAt: '' },
    ];
    const s = summarizeMonth(data, '2026-09');
    expect(s.cashUsed).toBe(5000);
    expect(s.creditUsed).toBe(12000);
  });
});
