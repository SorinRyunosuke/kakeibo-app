import { describe, expect, it } from 'vitest';
import { buildBackup, buildCSV, parseBackup } from '../../storage/backup';
import { createEmptyData, migrate } from '../../storage/schema';
import { END_OF_MONTH, type AppData } from '../../types';

function sampleData(): AppData {
  const d = createEmptyData();
  d.settings = { alerts: { at70: true, at90: false, at100: true } };
  d.fixedIncomes = [
    { id: 'i1', name: '給料', amount: 250000, freq: 'monthly', paymentDay: 25, active: true },
  ];
  d.creditCards = [
    {
      id: 'card1',
      name: '楽天カード',
      closingDay: END_OF_MONTH,
      paymentDay: 27,
      paymentMonthOffset: 1,
      color: '#bf0000',
    },
  ];
  d.fixedExpenses = [
    {
      id: 'f1',
      name: '家賃',
      amount: 120000,
      categoryId: 'cat_rent',
      freq: 'monthly',
      paymentDay: 27,
      paymentMethod: 'bank',
      active: true,
    },
  ];
  d.expenses = [
    {
      id: 'e1',
      amount: 5000,
      date: '2026-09-05',
      categoryId: 'cat_hobby',
      paymentMethod: 'credit',
      creditCardId: 'card1',
      merchant: 'Amazon',
      memo: 'テスト',
      createdAt: '2026-09-05T10:00:00.000Z',
    },
    {
      id: 'e2',
      amount: 850,
      date: '2026-09-09',
      categoryId: 'cat_conv',
      paymentMethod: 'cash',
      createdAt: '2026-09-09T10:00:00.000Z',
    },
  ];
  return d;
}

describe('JSONバックアップ', () => {
  it('書き出して読み戻すと同じデータになる', () => {
    const original = sampleData();
    const restored = parseBackup(buildBackup(original));
    expect(restored).toEqual(original);
  });

  it('envelope でなく素の AppData でも読み込める', () => {
    const original = sampleData();
    const restored = parseBackup(JSON.stringify(original));
    expect(restored.expenses).toHaveLength(2);
    expect(restored.creditCards[0].name).toBe('楽天カード');
  });

  it('壊れた／古いデータでも既定値で起動できる', () => {
    expect(migrate(null).categories.length).toBeGreaterThan(0);
    expect(migrate({ expenses: 'これは配列ではない' }).expenses).toEqual([]);
    // alerts は一部だけ持っていても既定値とマージされる
    const partial = migrate({ settings: { alerts: { at90: false } } });
    expect(partial.settings.alerts).toEqual({ at70: true, at90: false, at100: true });
  });

  it('v3以前の予算設定（budgetMode / defaultBudget / budgets）は取り込まない', () => {
    const migrated = migrate({
      schemaVersion: 3,
      budgets: [{ id: 'b1', month: '2026-09', amount: 90000 }],
      settings: { budgetMode: 'manual', defaultBudget: 123456, alerts: { at70: true, at90: true, at100: true } },
    });
    expect(migrated).not.toHaveProperty('budgets');
    expect(migrated.settings).not.toHaveProperty('budgetMode');
    expect(migrated.settings).not.toHaveProperty('defaultBudget');
  });

  it('v3以前のデータには「保険」カテゴリが補われる', () => {
    const migrated = migrate({
      schemaVersion: 3,
      categories: [{ id: 'cat_rent', name: '家賃', color: '#4cb782', icon: '🏠', order: 10 }],
    });
    expect(migrated.categories.some((c) => c.id === 'cat_insurance')).toBe(true);
  });

  it('v2以前の手取り月収(settings.income)は「給料」の固定収入に移行される', () => {
    const migrated = migrate({
      schemaVersion: 2,
      settings: { income: 240000 },
    });
    expect(migrated.settings).not.toHaveProperty('income');
    expect(migrated.fixedIncomes).toEqual([
      { id: 'inc_salary', name: '給料', amount: 240000, freq: 'monthly', paymentDay: 25, active: true },
    ]);
  });

  it('固定収入がすでにあれば手取りからの移行はしない', () => {
    const migrated = migrate({
      settings: { income: 240000 },
      fixedIncomes: [
        { id: 'x', name: '既存', amount: 100000, freq: 'monthly', paymentDay: 10, active: true },
      ],
    });
    expect(migrated.fixedIncomes).toHaveLength(1);
    expect(migrated.fixedIncomes[0].id).toBe('x');
  });
});

describe('CSV書き出し', () => {
  const csv = buildCSV(sampleData());
  const lines = csv.replace('﻿', '').split('\r\n');

  it('Excel向けにBOM付きで出力される', () => {
    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('ヘッダー行がある', () => {
    expect(lines[0]).toBe(
      'id,date,amount,category,paymentMethod,creditCard,merchant,memo,createdAt',
    );
  });

  it('日付昇順で、ID ではなく名前で出力される', () => {
    expect(lines[1]).toContain('2026-09-05');
    expect(lines[1]).toContain('趣味'); // categoryId ではなくカテゴリ名
    expect(lines[1]).toContain('楽天カード'); // creditCardId ではなくカード名
    expect(lines[2]).toContain('2026-09-09');
  });

  it('カンマや引用符を含む値がエスケープされる', () => {
    const d = sampleData();
    d.expenses[0].merchant = 'カフェ, 渋谷店';
    d.expenses[0].memo = 'これは"引用"です';
    const out = buildCSV(d).split('\r\n')[1];
    expect(out).toContain('"カフェ, 渋谷店"');
    expect(out).toContain('"これは""引用""です"');
  });
});
