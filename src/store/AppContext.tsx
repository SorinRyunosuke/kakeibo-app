import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppData,
  Budget,
  Category,
  CreditCard,
  Expense,
  FixedExpense,
  FixedIncome,
  Settings,
} from '../types';
import { createId } from '../lib/id';
import { LocalStorageRepository } from '../storage/localStorageRepo';
import { FALLBACK_CATEGORY_ID, createEmptyData } from '../storage/schema';

// ============================================================================
// アプリ全体の状態。
// 保存は Repository 経由なので、将来 API / DB に差し替えても
// このファイルより上 (画面側) は変更不要。
// ============================================================================

const repo = new LocalStorageRepository();

type ExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>;

interface AppContextValue {
  data: AppData;
  loading: boolean;
  toast: string | null;
  showToast: (message: string) => void;

  addExpense: (input: ExpenseInput) => void;
  updateExpense: (id: string, patch: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;

  addCategory: (input: Omit<Category, 'id' | 'order'>) => void;
  updateCategory: (id: string, patch: Partial<Category>) => void;
  deleteCategory: (id: string) => void;

  addCard: (input: Omit<CreditCard, 'id'>) => void;
  updateCard: (id: string, patch: Partial<CreditCard>) => void;
  deleteCard: (id: string) => void;

  addFixedExpense: (input: Omit<FixedExpense, 'id'>) => void;
  updateFixedExpense: (id: string, patch: Partial<FixedExpense>) => void;
  deleteFixedExpense: (id: string) => void;

  addFixedIncome: (input: Omit<FixedIncome, 'id'>) => void;
  updateFixedIncome: (id: string, patch: Partial<FixedIncome>) => void;
  deleteFixedIncome: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  setBudgetForMonth: (month: string, amount: number | null) => void;

  replaceAll: (next: AppData) => void;
  resetAll: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(createEmptyData);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // 初回読み込み
  useEffect(() => {
    let alive = true;
    repo.load().then((loaded) => {
      if (!alive) return;
      setData(loaded);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 変更のたびに保存 (初回ロード完了前は書かない — 空データで上書きしないため)
  useEffect(() => {
    if (loading) return;
    repo.save(data).catch((err: Error) => setToast(err.message));
  }, [data, loading]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const patchData = (fn: (d: AppData) => AppData) => setData((d) => fn(d));

    return {
      data,
      loading,
      toast,
      showToast,

      // --- 支出 -----------------------------------------------------------
      addExpense: (input) =>
        patchData((d) => ({
          ...d,
          expenses: [
            ...d.expenses,
            { ...input, id: createId('exp'), createdAt: new Date().toISOString() },
          ],
          // 次回の入力を楽にするため、直近の支払方法を覚えておく
          settings: {
            ...d.settings,
            lastPaymentMethod: input.paymentMethod,
            lastCreditCardId: input.creditCardId ?? d.settings.lastCreditCardId,
          },
        })),

      updateExpense: (id, patch) =>
        patchData((d) => ({
          ...d,
          expenses: d.expenses.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e,
          ),
        })),

      deleteExpense: (id) =>
        patchData((d) => ({ ...d, expenses: d.expenses.filter((e) => e.id !== id) })),

      // --- カテゴリ -------------------------------------------------------
      addCategory: (input) =>
        patchData((d) => ({
          ...d,
          categories: [
            ...d.categories,
            {
              ...input,
              id: createId('cat'),
              order: d.categories.reduce((max, c) => Math.max(max, c.order), -1) + 1,
            },
          ],
        })),

      updateCategory: (id, patch) =>
        patchData((d) => ({
          ...d,
          categories: d.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      // カテゴリを消しても支出は消さない。「その他」に寄せて履歴を守る
      deleteCategory: (id) =>
        patchData((d) => {
          if (d.categories.length <= 1) return d;
          const fallback =
            d.categories.find((c) => c.id === FALLBACK_CATEGORY_ID && c.id !== id)?.id ??
            d.categories.find((c) => c.id !== id)!.id;
          return {
            ...d,
            categories: d.categories.filter((c) => c.id !== id),
            expenses: d.expenses.map((e) =>
              e.categoryId === id ? { ...e, categoryId: fallback } : e,
            ),
            fixedExpenses: d.fixedExpenses.map((f) =>
              f.categoryId === id ? { ...f, categoryId: fallback } : f,
            ),
          };
        }),

      // --- クレジットカード -----------------------------------------------
      addCard: (input) =>
        patchData((d) => ({
          ...d,
          creditCards: [...d.creditCards, { ...input, id: createId('card') }],
        })),

      updateCard: (id, patch) =>
        patchData((d) => ({
          ...d,
          creditCards: d.creditCards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),

      // カード削除時、そのカードの支出は「その他」払いに変えて金額を残す
      deleteCard: (id) =>
        patchData((d) => ({
          ...d,
          creditCards: d.creditCards.filter((c) => c.id !== id),
          expenses: d.expenses.map((e) =>
            e.creditCardId === id
              ? { ...e, creditCardId: undefined, paymentMethod: 'other' as const }
              : e,
          ),
          fixedExpenses: d.fixedExpenses.map((f) =>
            f.creditCardId === id
              ? { ...f, creditCardId: undefined, paymentMethod: 'other' as const }
              : f,
          ),
        })),

      // --- 固定費 ---------------------------------------------------------
      addFixedExpense: (input) =>
        patchData((d) => ({
          ...d,
          fixedExpenses: [...d.fixedExpenses, { ...input, id: createId('fix') }],
        })),

      updateFixedExpense: (id, patch) =>
        patchData((d) => ({
          ...d,
          fixedExpenses: d.fixedExpenses.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        })),

      deleteFixedExpense: (id) =>
        patchData((d) => ({ ...d, fixedExpenses: d.fixedExpenses.filter((f) => f.id !== id) })),

      // --- 固定収入 -----------------------------------------------------
      addFixedIncome: (input) =>
        patchData((d) => ({
          ...d,
          fixedIncomes: [...d.fixedIncomes, { ...input, id: createId('inc') }],
        })),

      updateFixedIncome: (id, patch) =>
        patchData((d) => ({
          ...d,
          fixedIncomes: d.fixedIncomes.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        })),

      deleteFixedIncome: (id) =>
        patchData((d) => ({ ...d, fixedIncomes: d.fixedIncomes.filter((i) => i.id !== id) })),

      // --- 設定・予算 -----------------------------------------------------
      updateSettings: (patch) =>
        patchData((d) => ({ ...d, settings: { ...d.settings, ...patch } })),

      /** amount に null を渡すとその月の上書きを解除する */
      setBudgetForMonth: (month, amount) =>
        patchData((d) => {
          const rest = d.budgets.filter((b) => b.month !== month);
          if (amount === null) return { ...d, budgets: rest };
          const existing = d.budgets.find((b) => b.month === month);
          const budget: Budget = { id: existing?.id ?? createId('bdg'), month, amount };
          return { ...d, budgets: [...rest, budget] };
        }),

      // --- 一括操作 -------------------------------------------------------
      replaceAll: (next) => setData(next),
      resetAll: () => setData(createEmptyData()),
    };
  }, [data, loading, toast, showToast]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
