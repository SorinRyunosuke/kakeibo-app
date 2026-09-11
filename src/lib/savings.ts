import type { AppData } from '../types';
import { summarizeMonth } from './budget';

// ============================================================================
// 「その月、結局いくら貯金できたか」
//
//   貯金額 = 今月あと使えるお金の最終値 = 固定収入 − 固定費 − 変動支出
//
// プラスなら貯金できた、マイナスなら使いすぎ。月別履歴の一覧表示と、
// 月替わり時のお祝い/残念演出の両方がここを起点にする。
// ============================================================================

/** 指定月の貯金額（プラス=貯金できた／マイナス=使いすぎ） */
export function savingsOf(data: AppData, month: string): number {
  return summarizeMonth(data, month).remaining;
}

/**
 * その月に「貯金できた/できなかった」を語れるだけの実績があるか。
 * 支出が1件も無い月（使っていない・アプリを触っていない月）まで
 * 演出や履歴に出すと空虚なので、ここで弾く。
 */
export function hasActivity(data: AppData, month: string): boolean {
  return summarizeMonth(data, month).expenses.length > 0;
}
