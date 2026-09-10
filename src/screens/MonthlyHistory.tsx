import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { summarizeMonth } from '../lib/budget';
import { toMonthKey } from '../lib/date';
import { percent, yen } from '../lib/format';
import { AppBar, Delta, PeriodBar } from '../components/ui';
import { IconChevronRight } from '../components/icons';

// ============================================================================
// 月別履歴。1年分を並べて「先月よりいくら多く使ったか」を一覧する。
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

  /** その年の 12ヶ月分。未来の月と、データのない過去月は出さない */
  const rows = useMemo(() => {
    const out: { month: string; total: number; diff: number | null; budget: number; ratio: number }[] =
      [];
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
      });
    }
    return out;
  }, [data, year, currentMonth]);

  const yearTotal = rows.reduce((s, r) => s + r.total, 0);

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
          <span className="small muted">{year}年の合計</span>
          <b style={{ fontSize: 20, letterSpacing: '-0.02em' }}>{yen(yearTotal)}</b>
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
            return (
              <button
                key={r.month}
                className="list-row"
                onClick={() => onSelectMonth?.(r.month)}
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
                    <span className="list-row-value">{yen(r.total)}</span>
                    <span className="tiny">
                      {r.diff === null ? (
                        <span className="faint">—</span>
                      ) : (
                        <Delta value={r.diff} />
                      )}
                    </span>
                  </span>
                  <span className="list-row-sub">
                    予算 {yen(r.budget)} · 使用率 {percent(r.ratio)}%
                    {r.month === currentMonth && (
                      <span className="badge badge-ok" style={{ marginLeft: 6 }}>
                        今月
                      </span>
                    )}
                  </span>
                </span>
                <IconChevronRight size={16} className="chevron" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
