import { useMemo } from 'react';
import { useApp } from '../store/AppContext';
import { summarizeMonth, type WarningLevel } from '../lib/budget';
import { summarizeCards } from '../lib/creditCard';
import { addMonthsToKey, toMonthKey } from '../lib/date';
import { percent, yen } from '../lib/format';
import { Delta, Donut, Empty, Section } from '../components/ui';
import { IconUser } from '../components/icons';
import { ExpenseRow } from '../components/ExpenseRow';
import type { Expense } from '../types';

// ============================================================================
// ダッシュボード = アプリを開いた最初の画面。
//
// 表示順は「知りたい順」に固定する:
//   1. 今月あと使える金額（緑のヒーローカードに最大表示）
//   2. 今月の使用額 / 次回クレカ請求予定
//   3. 今月の支出（カテゴリ別）
//   4. 最近の支出
// ============================================================================

function greeting(hour: number): string {
  if (hour < 5) return 'こんばんは';
  if (hour < 11) return 'おはようございます';
  if (hour < 18) return 'こんにちは';
  return 'こんばんは';
}

/** 使用率に応じたメッセージ。設定でオフにしたしきい値は出さない */
function warningMessage(
  level: WarningLevel,
  remaining: number,
  ratio: number,
  alerts: { at70: boolean; at90: boolean; at100: boolean },
): { icon: string; text: string; bg: string; fg: string } | null {
  if (level === 'over' && alerts.at100) {
    return {
      icon: '🚨',
      text: `今月の予算を ${yen(-remaining)} 超えています`,
      bg: '#fdeceb',
      fg: '#c8352e',
    };
  }
  if (level === 'danger' && alerts.at90) {
    return {
      icon: '⚠️',
      text: `今月あと ${yen(remaining)} です`,
      bg: '#fdf3e0',
      fg: '#a86a08',
    };
  }
  if (level === 'warning' && alerts.at70) {
    return {
      icon: '⚠️',
      text: `今月の予算の ${percent(ratio)}% を使用しています`,
      bg: '#fdf3e0',
      fg: '#a86a08',
    };
  }
  return null;
}

export function Dashboard({
  onEditExpense,
  onOpenExpenses,
  onOpenAnalytics,
  onOpenBudget,
  onOpenCards,
}: {
  onEditExpense: (e: Expense) => void;
  onOpenExpenses: () => void;
  onOpenAnalytics: () => void;
  onOpenBudget: () => void;
  onOpenCards: () => void;
}) {
  const { data } = useApp();
  const today = new Date();
  const month = toMonthKey(today);

  const summary = useMemo(() => summarizeMonth(data, month), [data, month]);
  const prev = useMemo(() => summarizeMonth(data, addMonthsToKey(month, -1)), [data, month]);
  const cards = useMemo(
    () => summarizeCards(data.creditCards, data.expenses, today),
    // today は日単位でしか効かないので month をキーにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.creditCards, data.expenses, month],
  );

  const categoryMap = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );

  const alert = warningMessage(
    summary.warning,
    summary.remaining,
    summary.ratio,
    data.settings.alerts,
  );

  const recent = useMemo(
    () =>
      [...data.expenses]
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [data.expenses],
  );

  const top = summary.byCategory.slice(0, 4);
  const restAmount = summary.byCategory.slice(4).reduce((s, c) => s + c.amount, 0);
  const legend = [
    ...top.map((c) => ({
      id: c.categoryId,
      name: categoryMap.get(c.categoryId)?.name ?? '不明',
      color: categoryMap.get(c.categoryId)?.color ?? 'var(--text-faint)',
      amount: c.amount,
    })),
    ...(restAmount > 0
      ? [{ id: '__rest', name: 'その他', color: '#8fa0b5', amount: restAmount }]
      : []),
  ];

  const budgetNotSet = summary.budget <= 0;

  return (
    <div className="page">
      <header className="page-head">
        <p className="greeting">{greeting(today.getHours())}</p>
        <span className="avatar">
          <IconUser size={19} />
        </span>
      </header>

      {/* ---------- 1. 今月あと使える金額 ---------- */}
      <div className="hero">
        <p className="hero-label">今月あと使える金額</p>
        <p className="hero-amount">{yen(summary.remaining)}</p>
        <p className="hero-sub">
          使用額 {yen(summary.spent)} / 予算 {yen(summary.budget)}
        </p>
        <div className="hero-bar">
          <div
            className="hero-bar-fill"
            style={{ width: `${Math.min(100, Math.max(0, summary.ratio * 100))}%` }}
          />
        </div>
        <p className="hero-rate">
          {budgetNotSet ? '予算未設定' : `使用率 ${percent(summary.ratio)}%`}
        </p>
      </div>

      {alert && (
        <div
          className="alert"
          style={{ ['--alert-bg' as string]: alert.bg, ['--alert-fg' as string]: alert.fg }}
        >
          <span>{alert.icon}</span>
          <span>{alert.text}</span>
        </div>
      )}

      {budgetNotSet && (
        <button className="alert" style={{ width: '100%' }} onClick={onOpenBudget}>
          <span>💡</span>
          <span className="grow" style={{ textAlign: 'left' }}>
            予算を設定すると「あと使える金額」が出ます
          </span>
        </button>
      )}

      {/* ---------- 2. 今月の使用額 / 次回クレカ請求予定 ---------- */}
      <div className="stat-grid">
        <button className="stat-card" onClick={onOpenExpenses}>
          <p className="stat-label">今月の使用額</p>
          <p className="stat-value">{yen(summary.spent)}</p>
          <p className="stat-foot">
            <Delta value={summary.total - prev.total} />
            <span>前月比</span>
          </p>
        </button>

        <button className="stat-card" onClick={onOpenCards}>
          <p className="stat-label">次回クレカ請求予定</p>
          <p className="stat-value">{yen(cards.nextPaymentTotal)}</p>
          <p className="stat-foot">
            {cards.summaries.length === 0
              ? 'カード未登録'
              : `（未確定 ${yen(cards.unconfirmedTotal)}）`}
          </p>
        </button>
      </div>

      {/* 「今月まだ使える」と思っていても未払いが大きいときに気付かせる */}
      {cards.unpaidTotal > 0 &&
        summary.remaining > 0 &&
        cards.unpaidTotal > summary.remaining && (
          <div
            className="alert"
            style={{ ['--alert-bg' as string]: '#f3f0fd', ['--alert-fg' as string]: '#5b46b8' }}
          >
            <span>💳</span>
            <span>
              カード未払いが {yen(cards.unpaidTotal)} あります。今月の残り{' '}
              {yen(summary.remaining)} より大きい状態です。
            </span>
          </div>
        )}

      {/* ---------- 3. 今月の支出（カテゴリ別） ---------- */}
      <Section
        title="今月の支出（カテゴリ別）"
        action={
          summary.expenses.length > 0 ? (
            <button className="link" onClick={onOpenAnalytics}>
              分析を見る
            </button>
          ) : undefined
        }
      >
        {legend.length === 0 ? (
          <div className="card">
            <Empty icon="🧾">
              まだ支出がありません。
              <br />
              下の ＋ ボタンから登録してみましょう。
            </Empty>
          </div>
        ) : (
          <div className="card">
            <div className="donut-row">
              <Donut
                segments={legend.map((l) => ({ value: l.amount, color: l.color }))}
                size={104}
                thickness={17}
                centerValue={yen(summary.total)}
                centerLabel="合計"
              />
              <div className="legend">
                {legend.map((l) => (
                  <div className="legend-row" key={l.id}>
                    <span className="legend-dot" style={{ background: l.color }} />
                    <span className="legend-name truncate">{l.name}</span>
                    <span className="legend-value">{Math.round(l.amount).toLocaleString('ja-JP')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* ---------- 4. 最近の支出 ---------- */}
      <Section
        title="最近の支出"
        action={
          recent.length > 0 ? (
            <button className="link" onClick={onOpenExpenses}>
              すべて見る
            </button>
          ) : undefined
        }
      >
        {recent.length === 0 ? (
          <div className="card">
            <Empty icon="✏️">支出を登録すると、ここに履歴が並びます。</Empty>
          </div>
        ) : (
          <div className="list">
            {recent.map((e) => (
              <ExpenseRow key={e.id} expense={e} onClick={() => onEditExpense(e)} trailingDate />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
