import { describe, expect, it } from 'vitest';
import { hasActivity, savingsOf } from '../savings';
import { createEmptyData } from '../../storage/schema';
import type { AppData } from '../../types';

function dataWith(income: number, fixed: number, spent: number[]): AppData {
  const d = createEmptyData();
  d.fixedIncomes = [
    { id: 'i1', name: '給料', amount: income, freq: 'monthly', paymentDay: 25, active: true },
  ];
  if (fixed > 0) {
    d.fixedExpenses = [
      { id: 'f1', name: '家賃', amount: fixed, categoryId: 'cat_rent', freq: 'monthly', paymentDay: 27, paymentMethod: 'bank', active: true },
    ];
  }
  d.expenses = spent.map((amount, i) => ({
    id: `e${i}`,
    amount,
    date: '2026-09-01',
    categoryId: 'cat_food',
    paymentMethod: 'cash' as const,
    createdAt: '',
  }));
  return d;
}

describe('savingsOf: その月に結局いくら貯金できたか', () => {
  it('固定収入250,000 / 固定費120,000 / 支出50,000 -> 貯金80,000（プラス）', () => {
    expect(savingsOf(dataWith(250000, 120000, [50000]), '2026-09')).toBe(80000);
  });

  it('使いすぎればマイナスになる（貯金額はマイナスを許す）', () => {
    expect(savingsOf(dataWith(250000, 120000, [140000]), '2026-09')).toBe(-10000);
  });

  it('ぴったり使い切れば 0', () => {
    expect(savingsOf(dataWith(250000, 120000, [130000]), '2026-09')).toBe(0);
  });
});

describe('hasActivity: その月に語れるだけの実績があるか', () => {
  it('支出が1件もなければ false', () => {
    expect(hasActivity(dataWith(250000, 0, []), '2026-09')).toBe(false);
  });

  it('支出が1件でもあれば true', () => {
    expect(hasActivity(dataWith(250000, 0, [1000]), '2026-09')).toBe(true);
  });

  it('別の月の支出はカウントしない', () => {
    const d = dataWith(250000, 0, []);
    d.expenses = [
      { id: 'x', amount: 1000, date: '2026-08-01', categoryId: 'cat_food', paymentMethod: 'cash', createdAt: '' },
    ];
    expect(hasActivity(d, '2026-09')).toBe(false);
    expect(hasActivity(d, '2026-08')).toBe(true);
  });
});
