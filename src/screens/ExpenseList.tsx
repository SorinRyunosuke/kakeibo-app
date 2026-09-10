import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { summarizeMonth } from '../lib/budget';
import { addMonthsToKey, formatMonthLabel, toMonthKey } from '../lib/date';
import { yen } from '../lib/format';
import { Empty, PageHead, PeriodBar, Segmented } from '../components/ui';
import { IconHistory } from '../components/icons';
import { ExpenseRow } from '../components/ExpenseRow';
import type { Expense } from '../types';

// ============================================================================
// 支出一覧。月を切り替えつつ、支払方法で絞り込める。
// 「クレジットで何にいくら使ったか」をここからも辿れるようにしている。
// ============================================================================

type Filter = 'all' | 'cash' | 'credit' | 'bank' | 'other';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'cash', label: '現金' },
  { value: 'credit', label: 'カード' },
  { value: 'bank', label: '銀行' },
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function dateHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}月${d}日（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
}

function matches(e: Expense, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'credit') return e.paymentMethod === 'credit';
  if (f === 'cash') return e.paymentMethod === 'cash';
  if (f === 'bank') return e.paymentMethod === 'bank';
  return e.paymentMethod === 'debit' || e.paymentMethod === 'other';
}

export function ExpenseList({
  onEditExpense,
  onOpenHistory,
}: {
  onEditExpense: (e: Expense) => void;
  onOpenHistory: () => void;
}) {
  const { data } = useApp();
  const currentMonth = toMonthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [filter, setFilter] = useState<Filter>('all');

  const summary = useMemo(() => summarizeMonth(data, month), [data, month]);

  const filtered = useMemo(
    () => summary.expenses.filter((e) => matches(e, filter)),
    [summary.expenses, filter],
  );

  const filteredTotal = useMemo(
    () => filtered.reduce((s, e) => s + e.amount, 0),
    [filtered],
  );

  // 日付ごとにまとめる（新しい日付が上）
  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of filtered) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        total: items.reduce((s, e) => s + e.amount, 0),
      }));
  }, [filtered]);

  return (
    <div className="page">
      <PageHead
        title="支出一覧"
        action={
          <button className="icon-btn" onClick={onOpenHistory} aria-label="月別履歴">
            <IconHistory size={18} />
          </button>
        }
      />

      <PeriodBar
        label={formatMonthLabel(month)}
        onPrev={() => setMonth(addMonthsToKey(month, -1))}
        onNext={() => setMonth(addMonthsToKey(month, 1))}
        nextDisabled={month >= currentMonth}
      />

      <Segmented options={FILTERS} value={filter} onChange={setFilter} />

      <div className="row-between" style={{ marginTop: 14 }}>
        <span className="small muted">
          {filter === 'all' ? '合計' : `${FILTERS.find((f) => f.value === filter)?.label}の合計`}（
          {filtered.length}件）
        </span>
        <b style={{ fontSize: 16 }}>{yen(filteredTotal)}</b>
      </div>

      <div style={{ marginTop: 6 }}>
        {grouped.length === 0 ? (
          <Empty icon="📭">
            {filter === 'all'
              ? `${formatMonthLabel(month)}の支出はまだありません。`
              : '該当する支出はありません。'}
          </Empty>
        ) : (
          grouped.map((g) => (
            <div key={g.date}>
              <div className="date-header">
                <span>{dateHeading(g.date)}</span>
                <span className="faint">{yen(g.total)}</span>
              </div>
              <div className="list">
                {g.items.map((e) => (
                  <ExpenseRow key={e.id} expense={e} onClick={() => onEditExpense(e)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
