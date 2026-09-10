import { useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { AuthProvider } from './store/AuthContext';
import { AuthGate } from './screens/AuthGate';
import { Dashboard } from './screens/Dashboard';
import { ExpenseList } from './screens/ExpenseList';
import { Analytics } from './screens/Analytics';
import { More, type MorePage } from './screens/More';
import { ExpenseForm } from './screens/ExpenseForm';
import { MonthlyHistory } from './screens/MonthlyHistory';
import { CardDetail } from './screens/CardDetail';
import { BudgetPage } from './screens/settings/BudgetPage';
import { CardPage } from './screens/settings/CardPage';
import { CategoryPage } from './screens/settings/CategoryPage';
import { FixedExpensePage } from './screens/settings/FixedExpensePage';
import { FixedIncomePage } from './screens/settings/FixedIncomePage';
import { BackupPage } from './screens/settings/BackupPage';
import { IconChart, IconDots, IconHome, IconPlus, IconReceipt } from './components/icons';
import { BackGuard } from './lib/useBackClose';
import type { CreditCard, Expense } from './types';

// ============================================================================
// 画面遷移。
// 4つのタブ + 中央の登録ボタン。設定などの下位画面は簡易スタックで積む。
// ============================================================================

type Tab = 'home' | 'expenses' | 'analytics' | 'more';

type Page = { name: MorePage } | { name: 'cardDetail'; card: CreditCard };

const TABS: { id: Tab; label: string; Icon: typeof IconHome }[] = [
  { id: 'home', label: 'ホーム', Icon: IconHome },
  { id: 'expenses', label: '支出', Icon: IconReceipt },
  { id: 'analytics', label: '分析', Icon: IconChart },
  { id: 'more', label: 'その他', Icon: IconDots },
];

function Shell() {
  const { loading, toast } = useApp();
  const [tab, setTab] = useState<Tab>('home');
  const [stack, setStack] = useState<Page[]>([]);
  // null = 閉じている / 'new' = 新規登録 / Expense = 編集
  const [form, setForm] = useState<Expense | 'new' | null>(null);

  const top = stack[stack.length - 1] ?? null;

  if (loading) return <div className="app" />;

  const push = (page: Page) => {
    setStack((s) => [...s, page]);
    window.scrollTo({ top: 0 });
  };
  const pop = () => {
    setStack((s) => s.slice(0, -1));
    window.scrollTo({ top: 0 });
  };
  const goTab = (t: Tab) => {
    setTab(t);
    setStack([]);
    window.scrollTo({ top: 0 });
  };

  const editExpense = (e: Expense) => setForm(e);

  return (
    <div className="app">
      {/* 開いているページの数だけ履歴を積み、Android の戻るで1階層ずつ戻す */}
      {stack.map((_, i) => (
        <BackGuard key={i} onBack={pop} />
      ))}

      {top ? (
        <SubPage page={top} onBack={pop} onEditExpense={editExpense} onPush={push} />
      ) : (
        <>
          {tab === 'home' && (
            <Dashboard
              onEditExpense={editExpense}
              onOpenExpenses={() => goTab('expenses')}
              onOpenAnalytics={() => goTab('analytics')}
              onOpenBudget={() => push({ name: 'budget' })}
              onOpenCards={() => push({ name: 'cards' })}
            />
          )}
          {tab === 'expenses' && (
            <ExpenseList
              onEditExpense={editExpense}
              onOpenHistory={() => push({ name: 'history' })}
            />
          )}
          {tab === 'analytics' && (
            <Analytics onOpenCard={(card) => push({ name: 'cardDetail', card })} />
          )}
          {tab === 'more' && <More onOpen={(page) => push({ name: page })} />}
        </>
      )}

      <nav className="tabbar">
        <div className="tabbar-inner">
          {TABS.slice(0, 2).map((t) => (
            <TabButton
              key={t.id}
              label={t.label}
              Icon={t.Icon}
              active={tab === t.id && !top}
              onClick={() => goTab(t.id)}
            />
          ))}

          <div className="tab-fab-slot">
            <button className="fab" onClick={() => setForm('new')} aria-label="支出を登録">
              <IconPlus size={22} />
            </button>
          </div>

          {TABS.slice(2).map((t) => (
            <TabButton
              key={t.id}
              label={t.label}
              Icon={t.Icon}
              active={tab === t.id && !top}
              onClick={() => goTab(t.id)}
            />
          ))}
        </div>
      </nav>

      {form && (
        <ExpenseForm editing={form === 'new' ? undefined : form} onClose={() => setForm(null)} />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function SubPage({
  page,
  onBack,
  onEditExpense,
  onPush,
}: {
  page: Page;
  onBack: () => void;
  onEditExpense: (e: Expense) => void;
  onPush: (p: Page) => void;
}) {
  switch (page.name) {
    case 'budget':
      return <BudgetPage onBack={onBack} />;
    case 'fixed':
      return <FixedExpensePage onBack={onBack} />;
    case 'income':
      return <FixedIncomePage onBack={onBack} />;
    case 'cards':
      return (
        <CardPage onBack={onBack} onOpenDetail={(card) => onPush({ name: 'cardDetail', card })} />
      );
    case 'cardDetail':
      return <CardDetail card={page.card} onBack={onBack} onEditExpense={onEditExpense} />;
    case 'categories':
      return <CategoryPage onBack={onBack} />;
    case 'history':
      return <MonthlyHistory onBack={onBack} />;
    case 'backup':
      return <BackupPage onBack={onBack} />;
  }
}

function TabButton({
  label,
  Icon,
  active,
  onClick,
}: {
  label: string;
  Icon: typeof IconHome;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={`tab ${active ? 'on' : ''}`} onClick={onClick}>
      <Icon size={21} />
      {label}
    </button>
  );
}

export default function App() {
  // ログインを通るまで AppProvider をマウントしない。
  // = 未ログインのあいだは家計簿データの読み込みすら行わない。
  return (
    <AuthProvider>
      <AuthGate>
        <AppProvider>
          <Shell />
        </AppProvider>
      </AuthGate>
    </AuthProvider>
  );
}
