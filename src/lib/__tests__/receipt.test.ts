import { describe, expect, it } from 'vitest';
import {
  extractAmounts,
  extractDate,
  extractMerchants,
  normalizeText,
  parseReceipt,
  tidyJapaneseSpaces,
} from '../receipt';

// 実際のレシートに近い文面（OCR の癖も混ぜてある）でテストする
const TODAY = new Date(2026, 8, 9, 12); // 2026-09-09

const CONVENIENCE = `
セブンイレブン○○店
東京都渋谷区1-2-3
TEL 03-1234-5678

2026年9月9日(水) 13:45
レジ 02 責 1234

おにぎり鮭        168
サントリー天然水    108
からあげ棒         160

小計             436
消費税等          34
合計            ¥470

現金            1,000
お釣り            530
`;

const SUPERMARKET = `
スーパーマルエツ 渋谷店
2026/09/03 19:22

牛乳                 218
たまご               298
食パン               168
豚こま肉             580
にんじん             128

小　計            1,392
(8%対象           1,392)
消費税等             111

合　計            1,503

クレジット         1,503
ポイント             15
`;

const RESTAURANT = `
居酒屋 たかはし
2026-09-07 20:15

生ビール x2        1,100
枝豆                 380
唐揚げ               680

お会計
ご請求額           2,160

お預り             3,000
お釣               840
`;

describe('文字の正規化', () => {
  it('全角数字・記号を半角に寄せる', () => {
    expect(normalizeText('合計　￥１，２３４')).toBe('合計 ¥1,234');
  });
});

describe('金額の抽出', () => {
  it('コンビニ: 合計 470 円を第一候補にする', () => {
    const c = extractAmounts(normalizeText(CONVENIENCE));
    expect(c[0].amount).toBe(470);
    expect(c[0].confident).toBe(true);
  });

  it('お預り・お釣り・ポイントは候補から除く', () => {
    const amounts = extractAmounts(normalizeText(CONVENIENCE)).map((c) => c.amount);
    expect(amounts).not.toContain(1000); // 現金（お預り）
    expect(amounts).not.toContain(530); // お釣り
  });

  it('スーパー: 「合　計」のように空白が入っても拾える', () => {
    const c = extractAmounts(normalizeText(SUPERMARKET));
    expect(c[0].amount).toBe(1503);
    expect(c[0].confident).toBe(true);
  });

  it('小計・消費税・ポイントは第一候補にしない', () => {
    const c = extractAmounts(normalizeText(SUPERMARKET));
    expect(c[0].amount).not.toBe(1392); // 小計
    const amounts = c.map((x) => x.amount);
    expect(amounts).not.toContain(111); // 消費税等
    expect(amounts).not.toContain(15); // ポイント
  });

  it('飲食店: 「ご請求額」も合計として扱う', () => {
    const c = extractAmounts(normalizeText(RESTAURANT));
    expect(c[0].amount).toBe(2160);
    expect(c[0].confident).toBe(true);
  });

  it('合計がお預りより小さくても、お預りに引きずられない', () => {
    const c = extractAmounts(normalizeText(RESTAURANT));
    expect(c.map((x) => x.amount)).not.toContain(3000);
  });

  it('金額がラベルの次の行にある場合も拾える', () => {
    const text = `
合計
¥1,280
お預り
2,000
`;
    const c = extractAmounts(normalizeText(text));
    expect(c[0].amount).toBe(1280);
    expect(c[0].confident).toBe(true);
  });

  it('合計が読めなくても、候補は大きい順に並べて返す', () => {
    const text = `
商品A       500
商品B     1,200
商品C       300
`;
    const c = extractAmounts(normalizeText(text));
    expect(c.every((x) => !x.confident)).toBe(true);
    expect(c.map((x) => x.amount)).toEqual([1200, 500, 300]);
  });

  it('電話番号・登録番号・時刻を金額と誤認しない', () => {
    const text = `
TEL 03-1234-5678
登録番号 T1234567890123
2026年9月9日 13:45
合計 980
`;
    const amounts = extractAmounts(normalizeText(text)).map((x) => x.amount);
    expect(amounts).toEqual([980]);
  });

  it('同じ金額は1件にまとめる', () => {
    const c = extractAmounts(normalizeText(SUPERMARKET));
    expect(new Set(c.map((x) => x.amount)).size).toBe(c.length);
  });

  it('候補は6件までに絞る', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `商品${i} ${(i + 1) * 100}`).join('\n');
    expect(extractAmounts(normalizeText(lines)).length).toBeLessThanOrEqual(6);
  });
});

describe('日付の抽出', () => {
  it('2026年9月9日 形式', () => {
    expect(extractDate(normalizeText(CONVENIENCE), TODAY)).toBe('2026-09-09');
  });

  it('2026/09/03 形式', () => {
    expect(extractDate(normalizeText(SUPERMARKET), TODAY)).toBe('2026-09-03');
  });

  it('2026-09-07 形式', () => {
    expect(extractDate(normalizeText(RESTAURANT), TODAY)).toBe('2026-09-07');
  });

  it('26/09/09 のような2桁年も読む', () => {
    expect(extractDate('お買上 26/09/09', TODAY)).toBe('2026-09-09');
  });

  it('存在しない日付は採用しない', () => {
    expect(extractDate('2026年2月30日', TODAY)).toBeUndefined();
    expect(extractDate('2026/13/01', TODAY)).toBeUndefined();
  });

  it('未来の日付は誤読とみなして採用しない', () => {
    expect(extractDate('2027年5月1日', TODAY)).toBeUndefined();
  });

  it('10年以上前の日付は誤読とみなして採用しない', () => {
    expect(extractDate('2010年5月1日', TODAY)).toBeUndefined();
  });

  it('日付が無ければ undefined', () => {
    expect(extractDate('合計 500', TODAY)).toBeUndefined();
  });
});

describe('店名の候補', () => {
  it('先頭付近の行から店名を拾う', () => {
    expect(extractMerchants(normalizeText(CONVENIENCE))[0]).toBe('セブンイレブン○○店');
  });

  it('電話番号や住所らしい行は候補にしない', () => {
    const m = extractMerchants(normalizeText(CONVENIENCE));
    expect(m.some((x) => x.includes('TEL'))).toBe(false);
  });

  it('数字ばかりの行は候補にしない', () => {
    const m = extractMerchants(normalizeText('2026/09/03 19:22\nスーパーマルエツ'));
    expect(m).not.toContain('2026/09/03 19:22');
  });
});

describe('全体', () => {
  it('コンビニのレシートから金額・日付・店名がそろって取れる', () => {
    const r = parseReceipt(CONVENIENCE, TODAY);
    expect(r.amountCandidates[0].amount).toBe(470);
    expect(r.date).toBe('2026-09-09');
    expect(r.merchantCandidates[0]).toBe('セブンイレブン○○店');
  });

  it('何も読めなくても落ちずに空の結果を返す', () => {
    const r = parseReceipt('', TODAY);
    expect(r.amountCandidates).toEqual([]);
    expect(r.date).toBeUndefined();
    expect(r.merchantCandidates).toEqual([]);
  });

  it('意味のない文字列でも落ちない', () => {
    expect(() => parseReceipt('#$%&■□◆ ????', TODAY)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 実機OCRで実際に出た崩れ方（文字間に空白が入る／レジ番号が混ざる）を再現する
// ---------------------------------------------------------------------------

const OCR_NOISY = `
セブ ン イ レブ ン 渋 谷 店
東京都渋谷区1-2-3
TEL 03-1234-5678
2026年9月9日(水) 13:45
レジ 02   責 1234
おにぎり鮭 168
サ ン ト リー天然水 108
からあげ棒 160
小 計 436
消 費 税 等 34
合 計 ¥470
現 金 1,000
お 釣 り 530
ポ イ ン ト  5pt
`;

describe('OCRが文字間に空白を入れてくる場合', () => {
  it('「合 計」から 470 円を拾える', () => {
    const c = extractAmounts(normalizeText(OCR_NOISY));
    expect(c[0].amount).toBe(470);
    expect(c[0].confident).toBe(true);
  });

  it('「現 金」「お 釣 り」「ポ イ ン ト」を除外できる', () => {
    const amounts = extractAmounts(normalizeText(OCR_NOISY)).map((x) => x.amount);
    expect(amounts).not.toContain(1000);
    expect(amounts).not.toContain(530);
    expect(amounts).not.toContain(5);
  });

  it('レジ番号・責任者番号を金額候補にしない', () => {
    const amounts = extractAmounts(normalizeText(OCR_NOISY)).map((x) => x.amount);
    expect(amounts).not.toContain(1234);
    expect(amounts).not.toContain(2);
  });

  it('「小 計」「消 費 税 等」も第一候補にしない', () => {
    const c = extractAmounts(normalizeText(OCR_NOISY));
    expect(c[0].amount).toBe(470);
    const amounts = c.map((x) => x.amount);
    expect(amounts).not.toContain(436);
    expect(amounts).not.toContain(34);
  });

  it('店名の空白を詰めて読める形にする', () => {
    expect(extractMerchants(normalizeText(OCR_NOISY))[0]).toBe('セブンイレブン渋谷店');
  });
});

describe('日本語の字間空白の詰め処理', () => {
  it('日本語の間の空白だけを詰める', () => {
    expect(tidyJapaneseSpaces('セブ ン イ レブ ン 渋 谷 店')).toBe('セブンイレブン渋谷店');
    expect(tidyJapaneseSpaces('合 計')).toBe('合計');
  });

  it('半角英数の間の空白は残す（単語の区切りなので）', () => {
    expect(tidyJapaneseSpaces('SEVEN ELEVEN Shibuya')).toBe('SEVEN ELEVEN Shibuya');
  });

  it('日本語と英数が混ざる場合も壊さない', () => {
    expect(tidyJapaneseSpaces('サ ン ト リー天然水 108')).toBe('サントリー天然水 108');
  });
});

describe('店名候補から住所を除く', () => {
  it('番地を含む行は店名にしない', () => {
    const m = extractMerchants(normalizeText('セブンイレブン渋谷店\n東京都渋谷区1-2-3'));
    expect(m).toEqual(['セブンイレブン渋谷店']);
  });

  it('丁目を含む行は店名にしない', () => {
    const m = extractMerchants(normalizeText('マルエツ\n大阪市北区梅田3丁目'));
    expect(m).toEqual(['マルエツ']);
  });
});
