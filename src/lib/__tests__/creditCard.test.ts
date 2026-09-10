import { describe, expect, it } from 'vitest';
import { getBillingCycleFor, getCyclePeriodStart, summarizeCard, summarizeCards } from '../creditCard';
import { END_OF_MONTH, type CreditCard, type Expense } from '../../types';

/** 楽天カード想定: 月末締め / 翌月27日払い */
const rakuten: CreditCard = {
  id: 'card_rakuten',
  name: '楽天カード',
  closingDay: END_OF_MONTH,
  paymentDay: 27,
  paymentMonthOffset: 1,
  color: '#bf0000',
};

/** 三井住友カード想定: 15日締め / 翌月10日払い */
const smbc: CreditCard = {
  id: 'card_smbc',
  name: '三井住友カード',
  closingDay: 15,
  paymentDay: 10,
  paymentMonthOffset: 1,
  color: '#00a05a',
};

function ex(amount: number, date: string, cardId: string, id = date + amount): Expense {
  return {
    id,
    amount,
    date,
    categoryId: 'cat_other',
    paymentMethod: 'credit',
    creditCardId: cardId,
    createdAt: '',
  };
}

describe('ケース5: 締め日をまたぐ支出がどの請求に入るか', () => {
  it('月末締め翌月27日払い: 9/5 -> 9/30締め -> 10/27引き落とし', () => {
    expect(getBillingCycleFor(rakuten, '2026-09-05')).toEqual({
      closingDate: '2026-09-30',
      paymentDate: '2026-10-27',
    });
  });

  it('月末締め: 締め日当日 9/30 はその月の締めに入る', () => {
    expect(getBillingCycleFor(rakuten, '2026-09-30').paymentDate).toBe('2026-10-27');
  });

  it('月末締め: 10/1 は翌サイクル -> 11/27引き落とし', () => {
    expect(getBillingCycleFor(rakuten, '2026-10-01')).toEqual({
      closingDate: '2026-10-31',
      paymentDate: '2026-11-27',
    });
  });

  it('15日締め: 9/15 (締め日当日) -> 10/10引き落とし', () => {
    expect(getBillingCycleFor(smbc, '2026-09-15')).toEqual({
      closingDate: '2026-09-15',
      paymentDate: '2026-10-10',
    });
  });

  it('15日締め: 9/16 (締め日翌日) -> 1ヶ月後ろにずれて 11/10引き落とし', () => {
    expect(getBillingCycleFor(smbc, '2026-09-16')).toEqual({
      closingDate: '2026-10-15',
      paymentDate: '2026-11-10',
    });
  });

  it('年をまたぐ: 12/20 の利用 -> 12/31締め -> 翌年1/27払い', () => {
    expect(getBillingCycleFor(rakuten, '2026-12-20')).toEqual({
      closingDate: '2026-12-31',
      paymentDate: '2027-01-27',
    });
  });

  it('2月の月末締めは 28日 (平年) に丸められる', () => {
    expect(getBillingCycleFor(rakuten, '2026-02-10').closingDate).toBe('2026-02-28');
  });

  it('うるう年の2月末は 29日になる', () => {
    expect(getBillingCycleFor(rakuten, '2028-02-10').closingDate).toBe('2028-02-29');
  });

  it('締め日31日指定でも 4月なら 30日に丸められる', () => {
    const card = { ...rakuten, closingDay: 31 };
    expect(getBillingCycleFor(card, '2026-04-20').closingDate).toBe('2026-04-30');
  });

  it('翌々月払い (offset=2) も計算できる', () => {
    const card = { ...rakuten, paymentMonthOffset: 2 };
    expect(getBillingCycleFor(card, '2026-09-05').paymentDate).toBe('2026-11-27');
  });

  it('当月払い (offset=0) も計算できる', () => {
    const card = { ...smbc, paymentMonthOffset: 0, paymentDay: 26 };
    expect(getBillingCycleFor(card, '2026-09-10').paymentDate).toBe('2026-09-26');
  });
});

describe('ケース4: カード利用が未払い・次回請求に反映される', () => {
  const today = new Date(2026, 8, 9, 12); // 2026-09-09

  it('カードで30,000円使うと未払いと次回請求に反映される', () => {
    const s = summarizeCard(rakuten, [ex(30000, '2026-09-05', rakuten.id)], today);
    expect(s.unpaidTotal).toBe(30000);
    expect(s.next?.paymentDate).toBe('2026-10-27');
    expect(s.next?.amount).toBe(30000);
    // 9/30 締め前なので、この分はまだ「未確定」
    expect(s.unconfirmedTotal).toBe(30000);
    expect(s.confirmedTotal).toBe(0);
  });

  it('締め済み(確定)と締め前(未確定)が分けて集計される', () => {
    // 8月利用 = 8/31締め済み -> 9/27払い (確定)
    // 9月利用 = 9/30締め前   -> 10/27払い (未確定)
    const s = summarizeCard(
      rakuten,
      [
        ex(105000, '2026-08-20', rakuten.id),
        ex(20000, '2026-09-03', rakuten.id),
        ex(3450, '2026-09-08', rakuten.id),
      ],
      today,
    );
    expect(s.confirmedTotal).toBe(105000);
    expect(s.unconfirmedTotal).toBe(23450);
    expect(s.unpaidTotal).toBe(128450);

    expect(s.next?.paymentDate).toBe('2026-09-27');
    expect(s.next?.amount).toBe(105000);
    expect(s.next?.confirmed).toBe(true);

    expect(s.following?.paymentDate).toBe('2026-10-27');
    expect(s.following?.amount).toBe(23450);
    expect(s.following?.confirmed).toBe(false);
  });

  it('引き落とし日を過ぎた分は未払いから消える', () => {
    // 7月利用 -> 8/27引き落とし済み
    const s = summarizeCard(
      rakuten,
      [ex(50000, '2026-07-10', rakuten.id), ex(10000, '2026-09-01', rakuten.id)],
      today,
    );
    expect(s.unpaidTotal).toBe(10000);
    expect(s.upcoming).toHaveLength(1);
  });

  it('他カードの支出や現金支出は混ざらない', () => {
    const expenses: Expense[] = [
      ex(10000, '2026-09-01', rakuten.id),
      ex(99999, '2026-09-01', smbc.id),
      { id: 'cash', amount: 88888, date: '2026-09-01', categoryId: 'cat_food', paymentMethod: 'cash', createdAt: '' },
    ];
    expect(summarizeCard(rakuten, expenses, today).unpaidTotal).toBe(10000);
  });
});

describe('複数カードの横断集計', () => {
  const today = new Date(2026, 8, 9, 12);

  it('次回引き落とし合計と未払い合計を出す', () => {
    const expenses = [
      ex(105000, '2026-08-20', rakuten.id), // 9/27 払い
      ex(23450, '2026-09-05', rakuten.id), // 10/27 払い
      ex(30000, '2026-09-01', smbc.id), // 9/15締め -> 10/10 払い
    ];
    const o = summarizeCards([rakuten, smbc], expenses, today);
    expect(o.unpaidTotal).toBe(158450);
    expect(o.nextPaymentTotal).toBe(135000); // 楽天 105,000 + 三井住友 30,000
    expect(o.nearestPaymentDate).toBe('2026-09-27');
  });

  it('アーカイブしたカードは集計から外れる', () => {
    const o = summarizeCards(
      [{ ...rakuten, archived: true }, smbc],
      [ex(10000, '2026-09-01', rakuten.id), ex(5000, '2026-09-01', smbc.id)],
      today,
    );
    expect(o.unpaidTotal).toBe(5000);
    expect(o.summaries).toHaveLength(1);
  });
});

describe('請求サイクルの対象期間 (利用明細の見出し用)', () => {
  it('月末締め: 10/31締めの対象期間は 10/1 から', () => {
    expect(getCyclePeriodStart(rakuten, '2026-10-31')).toBe('2026-10-01');
  });

  it('15日締め: 9/15締めの対象期間は 8/16 から', () => {
    expect(getCyclePeriodStart(smbc, '2026-09-15')).toBe('2026-08-16');
  });

  it('月末締め: 3/31締めの対象期間は 3/1 から (2月末+1日が3/1になる)', () => {
    expect(getCyclePeriodStart(rakuten, '2026-03-31')).toBe('2026-03-01');
  });

  it('年をまたぐ: 1/31締めの対象期間は 1/1 から', () => {
    expect(getCyclePeriodStart(rakuten, '2027-01-31')).toBe('2027-01-01');
  });

  it('15日締め: 1/15締めの対象期間は前年 12/16 から', () => {
    expect(getCyclePeriodStart(smbc, '2027-01-15')).toBe('2026-12-16');
  });

  it('期間の開始日〜締め日に、そのサイクルの支出がすべて収まる', () => {
    const today = new Date(2026, 8, 9, 12);
    const expenses = [
      ex(1000, '2026-09-01', rakuten.id, 'a'),
      ex(2000, '2026-09-30', rakuten.id, 'b'),
      ex(3000, '2026-10-01', rakuten.id, 'c'),
    ];
    const s = summarizeCard(rakuten, expenses, today);
    for (const cycle of s.cycles) {
      for (const e of cycle.expenses) {
        expect(e.date >= cycle.periodStart).toBe(true);
        expect(e.date <= cycle.closingDate).toBe(true);
      }
    }
  });
});

describe('利用明細で辿れるデータ', () => {
  const today = new Date(2026, 8, 9, 12);

  it('サイクルごとに、どの支出が含まれるか取り出せる', () => {
    const s = summarizeCard(
      rakuten,
      [
        ex(5000, '2026-09-05', rakuten.id, 'amazon'),
        ex(1200, '2026-09-06', rakuten.id, 'conv'),
        ex(3500, '2026-09-07', rakuten.id, 'eat'),
        ex(8000, '2026-09-08', rakuten.id, 'cloth'),
        ex(30000, '2026-10-01', rakuten.id, 'next'),
      ],
      today,
    );
    const oct = s.upcoming.find((c) => c.paymentDate === '2026-10-27')!;
    expect(oct.amount).toBe(17700);
    expect(oct.expenses.map((e) => e.id).sort()).toEqual(['amazon', 'cloth', 'conv', 'eat']);

    const nov = s.upcoming.find((c) => c.paymentDate === '2026-11-27')!;
    expect(nov.expenses.map((e) => e.id)).toEqual(['next']);
  });

  it('支払済みサイクルも cycles には残り、過去の明細を辿れる', () => {
    const s = summarizeCard(
      rakuten,
      [ex(50000, '2026-07-10', rakuten.id, 'old'), ex(10000, '2026-09-01', rakuten.id, 'new')],
      today,
    );
    expect(s.cycles).toHaveLength(2);
    expect(s.upcoming).toHaveLength(1);
    const paid = s.cycles.filter((c) => c.paid);
    expect(paid).toHaveLength(1);
    expect(paid[0].expenses[0].id).toBe('old');
    expect(paid[0].paymentDate).toBe('2026-08-27');
  });
});
