// ============================================================================
// ドメイン型定義
// ここを唯一の「データの正」とし、保存層 (storage/) と計算層 (lib/) が参照する
// ============================================================================

/** 支払方法 */
export type PaymentMethod = 'cash' | 'bank' | 'credit' | 'debit' | 'other';

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'cash', label: '現金', icon: '💴' },
  { value: 'bank', label: '銀行口座', icon: '🏦' },
  { value: 'credit', label: 'クレジット', icon: '💳' },
  { value: 'debit', label: 'デビット', icon: '💠' },
  { value: 'other', label: 'その他', icon: '⋯' },
];

/** 月末締め / 月末払いを表す番兵値。31 だと 2月に破綻するため専用値を使う */
export const END_OF_MONTH = 99;

/** 支出 */
export interface Expense {
  id: string;
  /** 円 (整数) */
  amount: number;
  /** YYYY-MM-DD (ローカル日付。UTC 変換しない) */
  date: string;
  categoryId: string;
  paymentMethod: PaymentMethod;
  /** paymentMethod === 'credit' のときのみ有効 */
  creditCardId?: string;
  merchant?: string;
  memo?: string;
  /** 固定費から自動生成された場合、その固定費 ID */
  fixedExpenseId?: string;
  /** true の支出は「今月あと使える金額」の計算から除外する (固定費など) */
  excludeFromBudget?: boolean;
  createdAt: string;
  updatedAt?: string;
}

/** クレジットカード */
export interface CreditCard {
  id: string;
  name: string;
  /** 締め日 1-28 または END_OF_MONTH */
  closingDay: number;
  /** 支払日 1-28 または END_OF_MONTH */
  paymentDay: number;
  /** 締め日から何ヶ月後に引き落とされるか。0 = 当月, 1 = 翌月, 2 = 翌々月 */
  paymentMonthOffset: number;
  color: string;
  archived?: boolean;
}

/** カテゴリ */
export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
}

/** 月次予算 (月ごとに手動で上書きしたい場合に使う) */
export interface Budget {
  id: string;
  /** YYYY-MM */
  month: string;
  amount: number;
}

/** 固定費 */
export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  categoryId: string;
  /** 支払日 1-28 または END_OF_MONTH */
  paymentDay: number;
  paymentMethod: PaymentMethod;
  creditCardId?: string;
  active: boolean;
}

/** 予算の決め方 */
export type BudgetMode = 'auto' | 'manual';

/** 予算アラートを出す使用率のしきい値 */
export interface AlertSettings {
  at70: boolean;
  at90: boolean;
  at100: boolean;
}

export interface Settings {
  /** 手取り月収 */
  income: number;
  /** 使用率がしきい値を超えたときにダッシュボードで知らせる */
  alerts: AlertSettings;
  /**
   * auto   : 予算 = 手取り - 有効な固定費合計
   * manual : 予算 = defaultBudget (月ごとの Budget があればそちらが優先)
   */
  budgetMode: BudgetMode;
  /** budgetMode === 'manual' のときの既定予算 */
  defaultBudget: number;
  /** 直近で使った支払方法・カード (支出登録の初期値に使う) */
  lastPaymentMethod?: PaymentMethod;
  lastCreditCardId?: string;
}

/** localStorage に保存されるルートオブジェクト */
export interface AppData {
  schemaVersion: number;
  expenses: Expense[];
  creditCards: CreditCard[];
  categories: Category[];
  budgets: Budget[];
  fixedExpenses: FixedExpense[];
  settings: Settings;
}
