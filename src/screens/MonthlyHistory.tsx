import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { summarizeMonth } from '../lib/budget';
import { toMonthKey } from '../lib/date';
import { percent, signedYen, yen } from '../lib/format';
import { AppBar, Delta, PeriodBar } from '../components/ui';
import { IconChevronRight } from '../components/icons';
import { MonthlyReview } from '../components/MonthlyReview';

// ============================================================================
// 月別履歴。1年分を並べて「先月よりいくら多く使ったか」「結局いくら貯金
// できたか」を一覧する。行をタップするとお祝い/残念演出を見返せる。
// ============================================================================

export function MonthlyHistory({
  onBack,
  onSelectMonth,
}: {
  onBack: () => void;
  onSelectMonth?: (month: string) => void;
}) {
  const { data } = useApp();
  const today = new Date();
  const currentMonth = toMonthKey(today);
  const [year, setYear] = useState(today.getFullYear());
  const [reviewMonth, setReviewMonth] = useState<string | null>(null);

  /** その年の 12ヶ月分。未来の月と、データのない過去月は出さない */
  const rows = useMemo(() => {
    const out: {
      month: string;
      total: number;
      diff: number | null;
      budget: number;
      ratio: number;
      savings: number;
    }[] = [];
    for (let m = 12; m >= 1; m--) {
      const month = `${year}-${String(m).padStart(2, '0')}`;
      if (month > currentMonth) continue;

      const s = summarizeMonth(data, month);
      const prevKey =
        m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
      const prevTotal = summarizeMonth(data, prevKey).total;

      // 実績のない月は並べても情報が薄いので、今月だけは常に出す
      if (s.total === 0 && month !== currentMonth) continue;

      out.push({
        month,
        total: s.total,
        diff: prevTotal === 0 && s.total === 0 ? null : s.total - prevTotal,
        budget: s.budget,
        ratio: s.ratio,
        savings: s.remaining,
      });
    }
    return out;
  }, [data, year, currentMonth]);

  const yearTotal = rows.reduce((s, r) => s + r.total, 0);
  const yearSavings = rows.reduce((s, r) => s + r.savings, 0);

  return (
    <div className="page">
      <AppBar title="月別履歴" onBack={onBack} />

      <PeriodBar
        label={`${year}年`}
        onPrev={() => setYear((y) => y - 1)}
        onNext={() => setYear((y) => y + 1)}
        nextDisabled={year >= today.getFullYear()}
      />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row-between">
          <span className="small muted">{year}年の合計支出</span>
          <b style={{ fontSize: 20, letterSpacing: '-0.02em' }}>{yen(yearTotal)}</b>
        </div>
        <div className="divider" />
        <div className="row-between">
          <span className="small muted">{year}年の貯金</span>
          <b
            style={{
              fontSize: 20,
              letterSpacing: '-0.02em',
              color: yearSavings > 0 ? 'var(--primary)' : yearSavings < 0 ? 'var(--danger)' : undefined,
            }}
          >
            {signedYen(yearSavings)}
          </b>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <span className="empty-icon">📅</span>
          {year}年の記録はまだありません。
        </div>
      ) : (
        <div className="list">
          {rows.map((r) => {
            const m = Number(r.month.split('-')[1]);
            const isCurrent = r.month === currentMonth;
            return (
              <button
                key={r.month}
                className="list-row"
                onClick={() => {
                  onSelectMonth?.(r.month);
                  setReviewMonth(r.month);
                }}
              >
                <span
                  style={{
                    width: 40,
                    fontSize: 14,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {m}月
                </span>
                <span className="list-row-main">
                  <span className="row-between">
                    <span
                      className="list-row-value"
                      style={{
                        color:
                          r.savings > 0
                            ? 'var(--primary)'
                            : r.savings < 0
                              ? 'var(--danger)'
                              : undefined,
                      }}
                    >
                      貯金 {signedYen(r.savings)}
                    </span>
                    {isCurrent && (
                      <span className="badge badge-ok" style={{ marginLeft: 6 }}>
                        今月の見込み
                      </span>
                    )}
                  </span>
                  <span className="list-row-sub">
                    支出 {yen(r.total)} · 使用率 {percent(r.ratio)}%
                    {r.diff !== null && (
                      <>
                        {' '}
                        · <Delta value={r.diff} />
                      </>
                    )}
                  </span>
                </span>
                <IconChevronRight size={16} className="chevron" />
              </button>
            );
          })}
        </div>
      )}

      {reviewMonth &&
        (() => {
          const r = rows.find((x) => x.month === reviewMonth);
          if (!r) return null;
          return (
            <MonthlyReview
              month={r.month}
              savings={r.savings}
              projected={r.month === currentMonth}
              onClose={() => setReviewMonth(null)}
            />
          );
        })()}
    </div>
  );
}
