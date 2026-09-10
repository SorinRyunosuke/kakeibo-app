import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { describeCardCycle, summarizeCard, type BillingCycle } from '../lib/creditCard';
import { formatShortDate, monthOf, toMonthKey } from '../lib/date';
import { yen } from '../lib/format';
import { AppBar, Empty } from '../components/ui';
import { ExpenseRow } from '../components/ExpenseRow';
import type { CreditCard, Expense } from '../types';

// ============================================================================
// カード利用明細
//
// 「次回引き落とし ¥128,450」の中身が何なのかを辿れる画面。
// 請求サイクル単位で区切り、どの支出がどの引き落としに入るかを一覧する。
// ============================================================================

export function CardDetail({
  card,
  onBack,
  onEditExpense,
}: {
  card: CreditCard;
  onBack: () => void;
  onEditExpense: (e: Expense) => void;
}) {
  const { data } = useApp();
  const today = new Date();
  const thisMonth = toMonthKey(today);

  const summary = useMemo(
    () => summarizeCard(card, data.expenses, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [card, data.expenses, thisMonth],
  );

  const paid = useMemo(() => summary.cycles.filter((c) => c.paid).reverse(), [summary.cycles]);
  const [showPaid, setShowPaid] = useState(false);

  /** 今月このカードで使った額（利用日ベース） */
  const usedThisMonth = useMemo(
    () =>
      data.expenses
        .filter(
          (e) =>
            e.paymentMethod === 'credit' &&
            e.creditCardId === card.id &&
            monthOf(e.date) === thisMonth,
        )
        .reduce((s, e) => s + e.amount, 0),
    [data.expenses, card.id, thisMonth],
  );

  return (
    <div className="page">
      <AppBar title={card.name} onBack={onBack} />

      {/* --- サマリ --- */}
      <div className="card">
        <p className="tiny faint">{describeCardCycle(card)}</p>

        <div
          style={{
            marginTop: 12,
            background: 'var(--primary-tint)',
            borderRadius: 'var(--radius)',
            padding: '13px 14px',
          }}
        >
          <p className="tiny muted">
            次回引き落とし予定
            {summary.next && `（${formatShortDate(summary.next.paymentDate)}）`}
          </p>
          <p style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {yen(summary.next?.amount ?? 0)}
          </p>
          <div className="row" style={{ marginTop: 10, gap: 0 }}>
            <div className="grow">
              <p className="tiny faint">確定済み</p>
              <p className="bold">{yen(summary.confirmedTotal)}</p>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-strong)' }} />
            <div className="grow" style={{ paddingLeft: 14 }}>
              <p className="tiny faint">未確定</p>
              <p className="bold">{yen(summary.unconfirmedTotal)}</p>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-strong)' }} />
            <div className="grow" style={{ paddingLeft: 14 }}>
              <p className="tiny faint">未払い合計</p>
              <p className="bold">{yen(summary.unpaidTotal)}</p>
            </div>
          </div>
        </div>

        <p className="hint">
          今月（{today.getMonth() + 1}月）このカードで使った額は <b>{yen(usedThisMonth)}</b>{' '}
          です。引き落とし額とは対象期間が違うため一致しません。
        </p>
      </div>

      {summary.cycles.length === 0 ? (
        <Empty icon="🧾">
          このカードでの支出はまだありません。
          <br />
          支出登録で「クレジット」を選ぶとここに並びます。
        </Empty>
      ) : (
        <div style={{ marginTop: 8 }}>
          {summary.upcoming.length === 0 ? (
            <Empty icon="✅">未払いの請求はありません。</Empty>
          ) : (
            summary.upcoming.map((cycle) => (
              <CycleBlock
                key={cycle.key}
                cycle={cycle}
                color={card.color}
                onEditExpense={onEditExpense}
              />
            ))
          )}

          {paid.length > 0 && (
            <>
              <div className="divider" />
              <button
                className="link"
                onClick={() => setShowPaid((v) => !v)}
                style={{ display: 'block', marginBottom: 8 }}
              >
                {showPaid ? '▾' : '▸'} 支払済みの請求（{paid.length}件）
              </button>
              {showPaid &&
                paid.map((cycle) => (
                  <CycleBlock
                    key={cycle.key}
                    cycle={cycle}
                    color={card.color}
                    onEditExpense={onEditExpense}
                  />
                ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 請求サイクル 1 つ分（見出し + その中の支出一覧） */
function CycleBlock({
  cycle,
  color,
  onEditExpense,
}: {
  cycle: BillingCycle;
  color: string;
  onEditExpense: (e: Expense) => void;
}) {
  const expenses = [...cycle.expenses].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );

  const status = cycle.paid
    ? { label: '支払済', cls: 'badge' }
    : cycle.confirmed
      ? { label: '確定', cls: 'badge badge-ok' }
      : { label: '締め前', cls: 'badge badge-pending' };

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="date-header" style={{ alignItems: 'center' }}>
        <span>
          {formatShortDate(cycle.paymentDate)} 引き落とし{' '}
          <span className={status.cls} style={{ marginLeft: 4 }}>
            {status.label}
          </span>
        </span>
        <span className="bold" style={{ color: cycle.paid ? undefined : color }}>
          {yen(cycle.amount)}
        </span>
      </div>

      <p className="tiny faint" style={{ margin: '0 2px 8px' }}>
        {formatShortDate(cycle.periodStart)}〜{formatShortDate(cycle.closingDate)} の利用分 ·{' '}
        {expenses.length}件
        {!cycle.confirmed && ' · 締め日まで増える可能性があります'}
      </p>

      <div className="list">
        {expenses.map((e) => (
          <ExpenseRow key={e.id} expense={e} onClick={() => onEditExpense(e)} showDate />
        ))}
      </div>
    </div>
  );
}
