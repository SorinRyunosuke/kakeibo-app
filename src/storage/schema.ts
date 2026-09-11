import type { AppData, Category, FixedExpense, FixedIncome } from '../types';

/** スキーマ変更時にインクリメントし、migrate() に変換処理を足す */
export const SCHEMA_VERSION = 4;

// 明るめのパレット。ドーナツグラフと並べたときに互いに区別できる色を選ぶ
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat_food', name: '食費', color: '#ff8c42', icon: '🍚', order: 0 },
  { id: 'cat_eatout', name: '外食', color: '#ff6b9d', icon: '🍜', order: 1 },
  { id: 'cat_conv', name: 'コンビニ', color: '#2bc4b4', icon: '🏪', order: 2 },
  { id: 'cat_daily', name: '日用品', color: '#3f7fd8', icon: '🧴', order: 3 },
  { id: 'cat_transit', name: '交通費', color: '#22c3e6', icon: '🚃', order: 4 },
  { id: 'cat_hobby', name: '趣味', color: '#3dd68c', icon: '🎮', order: 5 },
  { id: 'cat_clothes', name: '衣服', color: '#9b7bf0', icon: '👕', order: 6 },
  { id: 'cat_beauty', name: '美容', color: '#f4823c', icon: '💇', order: 7 },
  { id: 'cat_medical', name: '医療', color: '#ef5f6b', icon: '💊', order: 8 },
  { id: 'cat_subsc', name: 'サブスク', color: '#19b8a6', icon: '📺', order: 9 },
  { id: 'cat_rent', name: '家賃', color: '#4cb782', icon: '🏠', order: 10 },
  { id: 'cat_insurance', name: '保険', color: '#8b7fd4', icon: '🛡', order: 11 },
  { id: 'cat_utility', name: '光熱費', color: '#efb041', icon: '💡', order: 12 },
  { id: 'cat_comm', name: '通信費', color: '#5b9df9', icon: '📱', order: 13 },
  { id: 'cat_other', name: 'その他', color: '#8fa0b5', icon: '📦', order: 14 },
];

/** 未分類の支出が寄せられる先。カテゴリ削除時の受け皿にもなる */
export const FALLBACK_CATEGORY_ID = 'cat_other';

export function createEmptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    expenses: [],
    creditCards: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    fixedExpenses: [],
    fixedIncomes: [],
    settings: {
      alerts: { at70: true, at90: true, at100: true },
    },
  };
}

/**
 * 保存データを現行スキーマに揃える。
 * 壊れた／古いデータでもアプリが起動できるよう、欠損は既定値で補う。
 */
export function migrate(raw: unknown): AppData {
  const base = createEmptyData();
  if (!raw || typeof raw !== 'object') return base;

  const d = raw as Partial<AppData> & { budgets?: unknown[] };
  const legacySettings = (d.settings ?? {}) as Partial<AppData['settings']> & {
    income?: number;
    budgetMode?: string;
    defaultBudget?: number;
  };

  // v1 → v2: 固定費に周期(freq)が無ければ「毎月」。固定収入テーブルを新設
  const fixedExpenses: FixedExpense[] = Array.isArray(d.fixedExpenses)
    ? d.fixedExpenses.map((f) => ({ ...f, freq: f.freq ?? 'monthly' }))
    : [];
  const fixedIncomes: FixedIncome[] = Array.isArray(d.fixedIncomes) ? d.fixedIncomes : [];

  // v2 → v3: 旧「手取り月収」(settings.income) を「給料」1件の固定収入に移す
  const legacyIncome = legacySettings.income ?? 0;
  if (legacyIncome > 0 && fixedIncomes.length === 0) {
    fixedIncomes.push({
      id: 'inc_salary',
      name: '給料',
      amount: legacyIncome,
      freq: 'monthly',
      paymentDay: 25,
      active: true,
    });
  }

  // v3 → v4: 「予算設定」を廃止。budgetMode / defaultBudget / budgets は取り込まない。
  // 予算は常に「固定収入合計 − 固定費合計」で決まる。
  const categories: Category[] =
    Array.isArray(d.categories) && d.categories.length > 0
      ? (d.categories as Category[]).slice()
      : base.categories;
  // v4: 「保険」カテゴリが無ければ家賃と光熱費の間に追加
  if (!categories.some((c) => c.id === 'cat_insurance')) {
    categories.push({ id: 'cat_insurance', name: '保険', color: '#8b7fd4', icon: '🛡', order: 10.5 });
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    expenses: Array.isArray(d.expenses) ? d.expenses : [],
    creditCards: Array.isArray(d.creditCards) ? d.creditCards : [],
    categories,
    fixedExpenses,
    fixedIncomes,
    settings: {
      alerts: { ...base.settings.alerts, ...(legacySettings.alerts ?? {}) },
      lastPaymentMethod: legacySettings.lastPaymentMethod,
      lastCreditCardId: legacySettings.lastCreditCardId,
    },
  };
}
