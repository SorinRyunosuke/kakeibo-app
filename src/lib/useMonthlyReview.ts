import { useEffect, useState } from 'react';
import type { AppData } from '../types';
import { addMonthsToKey, toMonthKey } from './date';
import { hasActivity, savingsOf } from './savings';

// ============================================================================
// 月替わり演出のトリガー
//
// 「先月は貯金できたか / 使いすぎたか」を、月が変わって最初にアプリを
// 開いたタイミングで一度だけ知らせる。何ヶ月分もアプリを開かなくても、
// 直近で終わった1ヶ月分だけを見せれば十分なので、キューは持たない。
// ============================================================================

/** どの月まで確認済みかを端末に保存する（バックアップ対象の家計データとは別管理） */
const LAST_REVIEWED_KEY = 'kakeibo:v1:lastReviewedMonth';

function readLastReviewed(): string | null {
  try {
    return localStorage.getItem(LAST_REVIEWED_KEY);
  } catch {
    return null;
  }
}

function writeLastReviewed(month: string): void {
  try {
    localStorage.setItem(LAST_REVIEWED_KEY, month);
  } catch {
    /* 書けなくても致命的ではないので無視する */
  }
}

export interface MonthlyReviewState {
  month: string;
  savings: number;
}

export function useMonthlyReview(
  data: AppData,
  loading: boolean,
): { pending: MonthlyReviewState | null; dismiss: () => void } {
  const [pending, setPending] = useState<MonthlyReviewState | null>(null);

  useEffect(() => {
    if (loading) return;

    const currentMonth = toMonthKey(new Date());
    const prevMonth = addMonthsToKey(currentMonth, -1);
    const last = readLastReviewed();

    if (last === null) {
      // 初回起動: これより前の月は「確認済み」にし、次の月替わりから通知を始める
      writeLastReviewed(currentMonth);
      return;
    }
    if (last >= currentMonth) return; // 今月分まで確認済み
    if (!hasActivity(data, prevMonth)) {
      // 先月に支出記録が無ければ祝いようがない。確認済みにして進める
      writeLastReviewed(currentMonth);
      return;
    }
    setPending({ month: prevMonth, savings: savingsOf(data, prevMonth) });
    // data は貯金額の算出だけに使うので、依存配列に含めて再計算に追従する
  }, [data, loading]);

  const dismiss = () => {
    writeLastReviewed(toMonthKey(new Date()));
    setPending(null);
  };

  return { pending, dismiss };
}
