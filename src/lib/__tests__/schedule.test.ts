import { describe, expect, it } from 'vitest';
import { eventsInMonth, scheduleTotals, totalFixedIncomes } from '../schedule';
import { createEmptyData } from '../../storage/schema';
import { END_OF_MONTH, type AppData } from '../../types';

const TODAY = new Date(2026, 8, 15, 12); // 2026-09-15

function base(): AppData {
  return createEmptyData();
}

describe('固定費のカレンダー展開', () => {
  it('毎月◯日の固定費はその月に1件、日付が正しい', () => {
    const d = base();
    d.fixedExpenses = [
      {
        id: 'f1',
        name: '家賃',
        amount: 90000,
        categoryId: 'cat_rent',
        freq: 'monthly',
        paymentDay: 27,
        paymentMethod: 'bank',
        active: true,
      },
    ];
    const events = eventsInMonth(d, '2026-09', TODAY).filter((e) => e.kind === 'expense');
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe('2026-09-27');
    expect(events[0].label).toBe('家賃');
    expect(events[0].amount).toBe(90000);
    expect(events[0].note).toBe('毎月27日');
  });

  it('毎週◯曜の固定費はその月の該当曜日ぶん展開される', () => {
    const d = base();
    // 2026-09 の火曜は 1, 8, 15, 22, 29 の5回
    d.fixedExpenses = [
      {
        id: 'w1',
        name: '習い事',
        amount: 3000,
        categoryId: 'cat_hobby',
        freq: 'weekly',
        paymentDay: 1,
        weekday: 2, // 火
        paymentMethod: 'cash',
        active: true,
      },
    ];
    const events = eventsInMonth(d, '2026-09', TODAY).filter((e) => e.kind === 'expense');
    expect(events.map((e) => e.date)).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
      '2026-09-22',
      '2026-09-29',
    ]);
    expect(events.every((e) => e.note === '毎週火曜')).toBe(true);
  });

  it('月末指定は短い月では月末日に丸まる（2026-02 → 28日）', () => {
    const d = base();
    d.fixedExpenses = [
      {
        id: 'f1',
        name: '家賃',
        amount: 90000,
        categoryId: 'cat_rent',
        freq: 'monthly',
        paymentDay: END_OF_MONTH,
        paymentMethod: 'bank',
        active: true,
      },
    ];
    const events = eventsInMonth(d, '2026-02', new Date(2026, 1, 1, 12));
    expect(events[0].date).toBe('2026-02-28');
    expect(events[0].note).toBe('毎月末');
  });

  it('active: false の固定費は出さない', () => {
    const d = base();
    d.fixedExpenses = [
      {
        id: 'f1',
        name: '解約済み',
        amount: 500,
        categoryId: 'cat_subsc',
        freq: 'monthly',
        paymentDay: 10,
        paymentMethod: 'credit',
        active: false,
      },
    ];
    expect(eventsInMonth(d, '2026-09', TODAY).filter((e) => e.kind === 'expense')).toHaveLength(0);
  });
});

describe('固定収入のカレンダー展開', () => {
  it('固定収入は kind:income で出る', () => {
    const d = base();
    d.fixedIncomes = [
      { id: 'i1', name: '給料', amount: 250000, freq: 'monthly', paymentDay: 25, active: true },
    ];
    const events = eventsInMonth(d, '2026-09', TODAY);
    const income = events.find((e) => e.kind === 'income');
    expect(income).toBeDefined();
    expect(income?.date).toBe('2026-09-25');
    expect(income?.amount).toBe(250000);
    expect(income?.label).toBe('給料');
  });

  it('毎週の固定収入も曜日ぶん展開される', () => {
    const d = base();
    // 2026-09 の金曜は 4, 11, 18, 25 の4回
    d.fixedIncomes = [
      { id: 'i1', name: 'バイト代', amount: 12000, freq: 'weekly', paymentDay: 1, weekday: 5, active: true },
    ];
    const events = eventsInMonth(d, '2026-09', TODAY).filter((e) => e.kind === 'income');
    expect(events.map((e) => e.date)).toEqual([
      '2026-09-04',
      '2026-09-11',
      '2026-09-18',
      '2026-09-25',
    ]);
  });
});

describe('クレジットカードの引き落とし', () => {
  const cardData = (): AppData => {
    const d = base();
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
    // 8月利用 → 8/31締め → 9/27引き落とし
    d.expenses = [
      {
        id: 'e1',
        amount: 45000,
        date: '2026-08-20',
        categoryId: 'cat_other',
        paymentMethod: 'credit',
        creditCardId: 'card1',
        createdAt: '',
      },
    ];
    return d;
  };

  it('その月に引き落とされるサイクルだけ拾う', () => {
    const events = eventsInMonth(cardData(), '2026-09', TODAY).filter((e) => e.kind === 'card');
    expect(events).toHaveLength(1);
    expect(events[0].date).toBe('2026-09-27');
    expect(events[0].label).toBe('楽天カード');
    expect(events[0].amount).toBe(45000);
  });

  it('締め済みなら note が「確定」になる', () => {
    // today を 9/15 にすると 8/31 の締めは過ぎている
    const events = eventsInMonth(cardData(), '2026-09', TODAY).filter((e) => e.kind === 'card');
    expect(events[0].note).toBe('確定');
  });

  it('別の月の引き落としは混ざらない', () => {
    const events = eventsInMonth(cardData(), '2026-10', TODAY).filter((e) => e.kind === 'card');
    expect(events).toHaveLength(0);
  });
});

describe('並び順とサマリ', () => {
  it('日付の昇順で返る', () => {
    const d = base();
    d.fixedExpenses = [
      { id: 'f1', name: 'A', amount: 100, categoryId: 'cat_other', freq: 'monthly', paymentDay: 25, paymentMethod: 'cash', active: true },
      { id: 'f2', name: 'B', amount: 200, categoryId: 'cat_other', freq: 'monthly', paymentDay: 5, paymentMethod: 'cash', active: true },
    ];
    d.fixedIncomes = [
      { id: 'i1', name: 'C', amount: 300, freq: 'monthly', paymentDay: 15, active: true },
    ];
    const dates = eventsInMonth(d, '2026-09', TODAY).map((e) => e.date);
    expect(dates).toEqual([...dates].sort());
  });

  it('scheduleTotals は入出金を分けて合計する', () => {
    const d = base();
    d.fixedExpenses = [
      { id: 'f1', name: '家賃', amount: 90000, categoryId: 'cat_rent', freq: 'monthly', paymentDay: 27, paymentMethod: 'bank', active: true },
    ];
    d.fixedIncomes = [
      { id: 'i1', name: '給料', amount: 250000, freq: 'monthly', paymentDay: 25, active: true },
    ];
    const totals = scheduleTotals(eventsInMonth(d, '2026-09', TODAY));
    expect(totals.outgoing).toBe(90000);
    expect(totals.incoming).toBe(250000);
  });
});

describe('固定収入の月換算合計（参考値）', () => {
  it('毎月はそのまま、毎週は ×52/12', () => {
    const total = totalFixedIncomes([
      { id: 'i1', name: '給料', amount: 250000, freq: 'monthly', paymentDay: 25, active: true },
      { id: 'i2', name: 'バイト', amount: 12000, freq: 'weekly', paymentDay: 1, weekday: 5, active: true },
      { id: 'i3', name: '停止中', amount: 99999, freq: 'monthly', paymentDay: 1, active: false },
    ]);
    // 250000 + round(12000 * 52 / 12) = 250000 + 52000
    expect(total).toBe(302000);
  });
});
