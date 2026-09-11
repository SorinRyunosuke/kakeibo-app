import { useEffect, useMemo } from 'react';
import { useBackClose } from '../lib/useBackClose';
import { formatMonthLabel } from '../lib/date';
import { signedYen } from '../lib/format';

// ============================================================================
// 月替わりのお祝い/残念演出
//
// 「その月、結局いくら貯金できたか」を大きく見せる全画面オーバーレイ。
// プラス = 紙吹雪で祝う。マイナス = しょんぼりした演出で来月への切り替えを促す。
// 月別履歴からの「見込み」表示にも同じ見た目を使い回す。
// ============================================================================

const CONFETTI_COLORS = ['#0d9e6b', '#3dd68c', '#f0a020', '#5b9df9', '#ff6b9d', '#f4823c'];

export function MonthlyReview({
  month,
  savings,
  projected = false,
  onClose,
}: {
  month: string;
  savings: number;
  /** 今月分（まだ月の途中）の「見込み」表示なら true */
  projected?: boolean;
  onClose: () => void;
}) {
  useBackClose(true, onClose);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const win = savings > 0;
  const flat = savings === 0;

  // 祝う時だけ紙吹雪を降らせる。ランダム値は開くたびに新しく振る
  const confetti = useMemo(
    () =>
      win
        ? Array.from({ length: 28 }, (_, i) => ({
            id: i,
            left: Math.random() * 100,
            delay: Math.random() * 0.5,
            duration: 2.1 + Math.random() * 1.5,
            size: 6 + Math.random() * 6,
            color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            rotate: Math.round(Math.random() * 360),
          }))
        : [],
    [win],
  );

  const monthLabel = formatMonthLabel(month);
  const title = win
    ? '貯金できました！'
    : flat
      ? 'ぴったり使い切りました'
      : '使いすぎてしまいました';
  const sub = win
    ? `${monthLabel}${projected ? 'の見込み' : ''}、おつかれさまでした`
    : flat
      ? `${monthLabel}${projected ? 'の見込み' : ''}、ぎりぎりセーフです`
      : `${monthLabel}${projected ? 'の見込み' : ''}、来月は取り返しましょう`;
  const icon = win ? '🎉' : flat ? '😌' : '😢';

  return (
    <div
      className={`review-backdrop ${win ? 'review-win' : 'review-lose'}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${monthLabel}の貯金結果`}
    >
      {confetti.map((c) => (
        <span
          key={c.id}
          className="confetti-piece"
          style={{
            left: `${c.left}%`,
            width: c.size,
            height: c.size * 0.4,
            background: c.color,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
            transform: `rotate(${c.rotate}deg)`,
          }}
        />
      ))}

      <div className={`review-card ${win ? 'pop-in' : 'droop-in'}`}>
        <span className="review-icon">{icon}</span>
        <p className="review-title">{title}</p>
        <p className={`review-amount ${win ? 'pos' : savings < 0 ? 'neg' : ''}`}>
          {signedYen(savings)}
        </p>
        <p className="review-sub">{sub}</p>
        <button className="btn btn-primary btn-block mt-16" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
