import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { summarizeMonth } from '../lib/budget';
import { summarizeCards, describeCardCycle } from '../lib/creditCard';
import { eventsInMonth, scheduleTotals, type ScheduleEvent } from '../lib/schedule';
import {
  addMonthsToKey,
  formatMonthLabel,
  formatRelativeDate,
  formatShortDate,
  toMonthKey,
} from '../lib/date';
import { percent, yen } from '../lib/format';
import { Delta, Donut, Empty, PageHead, PeriodBar, Section, Segmented } from '../components/ui';
import { Calendar, KIND_COLOR } from '../components/Calendar';
import { IconChevronRight } from '../components/icons';
import { PAYMENT_METHODS, type CreditCard } from '../types';

// ============================================================================
// 支出分析。ダッシュボードより優先度は下げ、振り返りたいときに見る場所。
// カレンダー（引き落とし・固定費・固定収入の予定）もここに統合している。
// ============================================================================

type Tab = 'calendar' | 'summary' | 'category' | 'card';

const TABS: { value: Tab; label: string }[] = [
  { value: 'calendar', label: 'カレンダー' },
  { value: 'summary', label: 'サマリー' },
  { value: 'category', label: 'カテゴリ' },
  { value: 'card', label: 'カード' },
];

export function Analytics({ onOpenCard }: { onOpenCard: (card: CreditCard) => void }) {
  const { data } = useApp();
  const currentMonth = toMonthKey(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [tab, setTab] = useState<Tab>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const goMonth = (m: string) => {
    setMonth(m);
    setSelectedDate(null);
  };

  const events = useMemo(() => eventsInMonth(data, month), [data, month]);

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
        onPrev={() => goMonth(addMonthsToKey(month, -1))}
        onNext={() => goMonth(addMonthsToKey(month, 1))}
        nextDisabled={tab !== 'calendar' && month >= currentMonth}
      />

      <Segmented options={TABS} value={tab} onChange={setTab} />

      {/* ---------- カレンダー ---------- */}
      {tab === 'calendar' && (
        <CalendarTab
          month={month}
          events={events}
          selectedDate={selectedDate}
          onSelectDate={(d) => setSelectedDate((cur) => (cur === d ? null : d))}
        />
      )}

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

/** 「カレンダー」タブの中身 */
function CalendarTab({
  month,
  events,
  selectedDate,
  onSelectDate,
}: {
  month: string;
  events: ScheduleEvent[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const totals = scheduleTotals(events);

  const shown = selectedDate ? events.filter((e) => e.date === selectedDate) : events;

  const kindMeta: Record<ScheduleEvent['kind'], { icon: string; label: string }> = {
    card: { icon: '💳', label: 'カード引き落とし' },
    expense: { icon: '🔁', label: '固定費' },
    income: { icon: '💰', label: '固定収入' },
  };

  return (
    <div style={{ marginTop: 14 }}>
      <div className="stat-grid" style={{ marginTop: 0 }}>
        <div className="stat-card">
          <p className="stat-label">今月の引き落とし予定</p>
          <p className="stat-value">{yen(totals.outgoing)}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">今月の入金予定</p>
          <p className="stat-value" style={{ color: 'var(--primary)' }}>
            {yen(totals.incoming)}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Calendar
          month={month}
          events={events}
          selected={selectedDate}
          onSelect={onSelectDate}
        />
        <div className="cal-legend">
          <span>
            <i style={{ background: KIND_COLOR.card }} />
            カード
          </span>
          <span>
            <i style={{ background: KIND_COLOR.expense }} />
            固定費
          </span>
          <span>
            <i style={{ background: KIND_COLOR.income }} />
            固定収入
          </span>
        </div>
      </div>

      <Section
        title={
          selectedDate
            ? `${formatShortDate(selectedDate)} の予定`
            : `${formatMonthLabel(month)} の予定`
        }
      >
        {shown.length === 0 ? (
          <div className="card">
            <Empty icon="🗓">
              {selectedDate ? 'この日の予定はありません。' : '予定はありません。'}
              <br />
              固定費・固定収入は「その他」タブから登録できます。
            </Empty>
          </div>
        ) : (
          <div className="list">
            {shown.map((e, i) => {
              const meta = kindMeta[e.kind];
              return (
                <div className="list-row" key={`${e.sourceId}-${e.date}-${i}`}>
                  <span
                    className="tile"
                    style={{
                      background: `color-mix(in srgb, ${KIND_COLOR[e.kind]} 16%, #fff)`,
                    }}
                  >
                    {meta.icon}
                  </span>
                  <span className="list-row-main">
                    <span className="list-row-title">{e.label}</span>
                    <span className="list-row-sub">
                      {selectedDate ? meta.label : formatRelativeDate(e.date)}
                      {e.note ? ` · ${e.note}` : ''}
                    </span>
                  </span>
                  <span
                    className="list-row-value"
                    style={{ color: e.kind === 'income' ? 'var(--primary)' : undefined }}
                  >
                    {e.kind === 'income' ? '+' : ''}
                    {yen(e.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
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
