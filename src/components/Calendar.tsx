import { useMemo } from 'react';
import type { ScheduleEvent, ScheduleKind } from '../lib/schedule';
import { daysInMonth, localDate, todayISO } from '../lib/date';

// ============================================================================
// 月表示のカレンダー。
// 各日にスケジュール（クレカ引き落とし・固定費・固定収入）のドットを出す。
// 依存を増やさないよう自前で組む。
// ============================================================================

export const KIND_COLOR: Record<ScheduleKind, string> = {
  card: '#9b7bf0',
  expense: '#ff8c42',
  income: 'var(--primary)',
};

const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export function Calendar({
  month,
  events,
  selected,
  onSelect,
  today = new Date(),
}: {
  /** "YYYY-MM" */
  month: string;
  events: ScheduleEvent[];
  selected: string | null;
  onSelect: (date: string) => void;
  today?: Date;
}) {
  const [year, month1] = month.split('-').map(Number);
  const todayStr = todayISO(today);

  // 日付ごとにイベントをまとめる
  const byDate = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [events]);

  const firstWeekday = localDate(year, month1, 1).getDay(); // 0=日
  const total = daysInMonth(year, month1);

  // 先頭の空白 + 日数ぶんのセル
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  // 末尾を7の倍数に揃える
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="cal">
      <div className="cal-head">
        {WEEK_LABELS.map((w, i) => (
          <div key={w} className={`cal-hcell ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}`}>
            {w}
          </div>
        ))}
      </div>

      <div className="cal-grid">
        {cells.map((day, idx) => {
          if (day == null) return <div key={idx} className="cal-cell empty" />;

          const date = `${month}-${String(day).padStart(2, '0')}`;
          const dayEvents = byDate.get(date) ?? [];
          const weekday = idx % 7;
          const isToday = date === todayStr;
          const isSelected = date === selected;

          // 表示するドットは3色ぶんまで（種類の有無で色を出す）
          const kinds: ScheduleKind[] = [];
          for (const k of ['card', 'expense', 'income'] as ScheduleKind[]) {
            if (dayEvents.some((e) => e.kind === k)) kinds.push(k);
          }

          return (
            <button
              key={idx}
              className={`cal-cell ${isSelected ? 'sel' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => onSelect(date)}
            >
              <span
                className={`cal-day ${weekday === 0 ? 'sun' : weekday === 6 ? 'sat' : ''}`}
              >
                {day}
              </span>
              {kinds.length > 0 && (
                <span className="cal-dots">
                  {kinds.map((k) => (
                    <span
                      key={k}
                      className="cal-dot"
                      style={{ background: KIND_COLOR[k] }}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
