import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { summarizeMonth } from '../lib/budget';
import { summarizeCards, describeCardCycle } from '../lib/creditCard';
import { addMonthsToKey, formatMonthLabel, formatShortDate, toMonthKey } from '../lib/date';
import { percent, yen } from '../lib/format';
import { Delta, Donut, Empty, PageHead, PeriodBar, Section, Segmented } from '../components/ui';
import { IconChevronRight } from '../components/icons';
import { PAYMENT_METHODS, type CreditCard } from '../types';

// ============================================================================
// 支出分析。ダッシュボードより優先度は下げ、振り返りたいときに見る場所。
// ============================================================================

type Tab = 'summary' | 'category' | 'card';

const TABS: { value: Tab; label: string }[] = [
  { value: 'summary', label: 'サマリー' },
  { value: 'category', label: 'カテゴリ' },
  { value: 'card', label: 'カード' },
];

export function Analytics({ onOpenCard }: { onOpenCard: (card: CreditCard) => void }) {
  const { data } = useApp();
  const currentMonth = toMonthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [tab, setTab] = useState<Tab>('summary');

  const s = useMemo(() => summarizeMonth(data, month), [data, month]);
  const prev = useMemo(() => summarizeMonth(data, addMonthsToKey(month, -1)), [data, month]);
  const cards = useMemo(
    () => summarizeCards(data.creditCards, data.expenses, new Date()),
    [data.creditCards, data.expenses],
  );
  const categoryMap = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );

  const diff = s.total - prev.total;
  const diffPct = prev.total > 0 ? Math.round((diff / prev.total) * 100) : null;
  const maxCategory = Math.max(1, ...s.byCategory.map((c) => c.amount));
  const noData = s.expenses.length === 0;

  return (
    <div className="page">
      <PageHead title="支出分析" />

      <PeriodBar
        label={formatMonthLabel(month)}
        onPrev={() => setMonth(addMonthsToKey(month, -1))}
        onNext={() => setMonth(addMonthsToKey(month, 1))}
        nextDisabled={month >= currentMonth}
      />

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {/* ---------- サマリー ---------- */}
      {tab === 'summary' && (
        <>
          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="stat-card">
              <p className="stat-label">総支出</p>
              <p className="stat-value">{yen(s.total)}</p>
              <p className="stat-foot">
                <Delta value={diff} />
                <span>{diffPct !== null ? `前月比 (${diffPct}%)` : '前月比'}</span>
              </p>
            </div>
            <div className="stat-card">
              <p className="stat-label">予算に対する使用率</p>
              <p className="stat-value">{percent(s.ratio)}%</p>
              <div className="bar" style={{ marginTop: 7 }}>
                <div
                  className="bar-fill"
                  style={{
                    width: `${Math.min(100, s.ratio * 100)}%`,
                    background: s.remaining < 0 ? 'var(--danger)' : 'var(--primary)',
                  }}
                />
              </div>
            </div>
          </div>

          {noData ? (
            <div className="card mt-16">
              <Empty icon="📊">{formatMonthLabel(month)}のデータがありません。</Empty>
            </div>
          ) : (
            <>
              <Section title="カテゴリ別支出">
                <div className="card">
                  <div className="donut-row">
                    <Donut
                      segments={s.byCategory.map((c) => ({
                        value: c.amount,
                        color: categoryMap.get(c.categoryId)?.color ?? '#8fa0b5',
                      }))}
                      size={104}
                      thickness={17}
                      centerValue={yen(s.total)}
                      centerLabel="合計"
                    />
                    <div className="legend">
                      {s.byCategory.slice(0, 5).map((c) => {
                        const cat = categoryMap.get(c.categoryId);
                        return (
                          <div className="legend-row" key={c.categoryId}>
                            <span
                              className="legend-dot"
                              style={{ background: cat?.color ?? '#8fa0b5' }}
                            />
                            <span className="legend-name truncate">{cat?.name ?? '不明'}</span>
                            <span className="legend-value">
                              {Math.round(c.amount).toLocaleString('ja-JP')}
                            </span>
                            <span className="legend-pct">
                              ({percent(s.total > 0 ? c.amount / s.total : 0)}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="支払方法別">
                <div className="card">
                  <div className="list" style={{ gap: 12 }}>
                    <UsageBar
                      label="クレジットカード利用額"
                      amount={s.creditUsed}
                      total={s.total}
                      color="#9b7bf0"
                      note={
                        cards.unconfirmedTotal > 0
                          ? `未確定 ${yen(cards.unconfirmedTotal)}`
                          : undefined
                      }
                    />
                    <UsageBar
                      label="現金利用額"
                      amount={s.cashUsed}
                      total={s.total}
                      color="var(--primary)"
                    />
                    {PAYMENT_METHODS.filter(
                      (p) =>
                        p.value !== 'credit' &&
                        p.value !== 'cash' &&
                        (s.byPaymentMethod[p.value] ?? 0) > 0,
                    ).map((p) => (
                      <UsageBar
                        key={p.value}
                        label={`${p.label}利用額`}
                        amount={s.byPaymentMethod[p.value] ?? 0}
                        total={s.total}
                        color="#5b9df9"
                      />
                    ))}
                  </div>
                </div>
              </Section>
            </>
          )}
        </>
      )}

      {/* ---------- カテゴリ ---------- */}
      {tab === 'category' && (
        <div style={{ marginTop: 14 }}>
          {noData ? (
            <div className="card">
              <Empty icon="📊">{formatMonthLabel(month)}のデータがありません。</Empty>
            </div>
          ) : (
            <div className="card">
              <div className="list" style={{ gap: 13 }}>
                {s.byCategory.map((c) => {
                  const cat = categoryMap.get(c.categoryId);
                  return (
                    <div key={c.categoryId}>
                      <div className="row-between" style={{ fontSize: 13.5 }}>
                        <span className="truncate">
                          {cat?.icon} {cat?.name ?? '不明'}
                        </span>
                        <span>
                          <b>{yen(c.amount)}</b>{' '}
                          <span className="faint tiny">
                            {percent(s.total > 0 ? c.amount / s.total : 0)}%
                          </span>
                        </span>
                      </div>
                      <div className="bar" style={{ marginTop: 6 }}>
                        <div
                          className="bar-fill"
                          style={{
                            width: `${(c.amount / maxCategory) * 100}%`,
                            background: cat?.color ?? '#8fa0b5',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---------- カード ---------- */}
      {tab === 'card' && (
        <div style={{ marginTop: 14 }}>
          {cards.summaries.length === 0 ? (
            <div className="card">
              <Empty icon="💳">カードが登録されていません。</Empty>
            </div>
          ) : (
            <>
              <div className="stat-grid" style={{ marginTop: 0 }}>
                <div className="stat-card">
                  <p className="stat-label">次回引き落とし合計</p>
                  <p className="stat-value">{yen(cards.nextPaymentTotal)}</p>
                  <p className="stat-foot">
                    {cards.nearestPaymentDate
                      ? `${formatShortDate(cards.nearestPaymentDate)} 予定`
                      : '予定なし'}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">未払い残高合計</p>
                  <p className="stat-value">{yen(cards.unpaidTotal)}</p>
                  <p className="stat-foot">未確定 {yen(cards.unconfirmedTotal)}</p>
                </div>
              </div>

              <Section title={`${formatMonthLabel(month)}のカード利用`}>
                <div className="card">
                  <div className="row-between">
                    <span className="small muted">利用額（利用日ベース）</span>
                    <b style={{ fontSize: 17 }}>{yen(s.creditUsed)}</b>
                  </div>
                  <p className="hint">
                    「利用額」は使った月、「請求予定」は引き落とし日ベースなので金額は一致しません。
                  </p>
                </div>
              </Section>

              <Section title="カードごとの状況">
                <div className="list">
                  {cards.summaries.map((c) => (
                    <button
                      key={c.card.id}
                      className="list-row"
                      onClick={() => onOpenCard(c.card)}
                    >
                      <span
                        className="tile"
                        style={{
                          background: `color-mix(in srgb, ${c.card.color} 16%, #fff)`,
                          color: c.card.color,
                        }}
                      >
                        💳
                      </span>
                      <span className="list-row-main">
                        <span className="list-row-title">{c.card.name}</span>
                        <span className="list-row-sub">
                          {describeCardCycle(c.card)} · 確定 {yen(c.confirmedTotal)} / 未確定{' '}
                          {yen(c.unconfirmedTotal)}
                        </span>
                      </span>
                      <span className="list-row-value">{yen(c.unpaidTotal)}</span>
                      <IconChevronRight size={16} className="chevron" />
                    </button>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** ラベル + 金額 + 割合バー */
function UsageBar({
  label,
  amount,
  total,
  color,
  note,
}: {
  label: string;
  amount: number;
  total: number;
  color: string;
  note?: string;
}) {
  return (
    <div>
      <div className="row-between" style={{ fontSize: 13.5 }}>
        <span className="muted">{label}</span>
        <b>{yen(amount)}</b>
      </div>
      <div className="bar" style={{ marginTop: 6 }}>
        <div
          className="bar-fill"
          style={{ width: `${total > 0 ? (amount / total) * 100 : 0}%`, background: color }}
        />
      </div>
      {note && <p className="tiny faint" style={{ marginTop: 4 }}>{note}</p>}
    </div>
  );
}
