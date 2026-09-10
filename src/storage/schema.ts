import type { AppData, Category } from '../types';

/** スキーマ変更時にインクリメントし、migrate() に変換処理を足す */
export const SCHEMA_VERSION = 1;

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
  { id: 'cat_utility', name: '光熱費', color: '#efb041', icon: '💡', order: 11 },
  { id: 'cat_comm', name: '通信費', color: '#5b9df9', icon: '📱', order: 12 },
  { id: 'cat_other', name: 'その他', color: '#8fa0b5', icon: '📦', order: 13 },
];

/** 未分類の支出が寄せられる先。カテゴリ削除時の受け皿にもなる */
export const FALLBACK_CATEGORY_ID = 'cat_other';

export function createEmptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    expenses: [],
    creditCards: [],
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    budgets: [],
    fixedExpenses: [],
    settings: {
      income: 0,
      budgetMode: 'manual',
      defaultBudget: 80000,
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

  const d = raw as Partial<AppData>;

  return {
    schemaVersion: SCHEMA_VERSION,
    expenses: Array.isArray(d.expenses) ? d.expenses : [],
    creditCards: Array.isArray(d.creditCards) ? d.creditCards : [],
    categories:
      Array.isArray(d.categories) && d.categories.length > 0 ? d.categories : base.categories,
    budgets: Array.isArray(d.budgets) ? d.budgets : [],
    fixedExpenses: Array.isArray(d.fixedExpenses) ? d.fixedExpenses : [],
    settings: {
      ...base.settings,
      ...(d.settings ?? {}),
      // alerts は後から足したフィールドなので、古いデータでも既定値で補う
      alerts: { ...base.settings.alerts, ...(d.settings?.alerts ?? {}) },
    },
  };
}
