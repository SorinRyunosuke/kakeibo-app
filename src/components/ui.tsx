import { useEffect, type ReactNode } from 'react';
import { useBackClose } from '../lib/useBackClose';
import {
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
} from './icons';

// ============================================================================
// 汎用 UI 部品
// ============================================================================

/** 下位ページのヘッダー（戻る + 中央タイトル） */
export function AppBar({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="appbar">
      <button className="appbar-btn" onClick={onBack} aria-label="戻る">
        <IconChevronLeft size={22} />
      </button>
      <h1 className="appbar-title">{title}</h1>
      <div style={{ display: 'grid', placeItems: 'center' }}>{action}</div>
    </header>
  );
}

/** タブ直下の画面ヘッダー（大きい左寄せタイトル） */
export function PageHead({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="page-head">
      <h1 className="page-head-title">{title}</h1>
      {action}
    </header>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Empty({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon">{icon}</span>
      {children}
    </div>
  );
}

/** セグメント切替 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  plain = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** true にすると選択中が白（標準カテゴリ / カスタム のような使い方） */
  plain?: boolean;
}) {
  return (
    <div className={`segmented ${plain ? 'segmented--plain' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          className={`segmented-item ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** 期間（月・年）の前後移動バー */
export function PeriodBar({
  label,
  onPrev,
  onNext,
  nextDisabled,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
}) {
  return (
    <div className="periodbar">
      <button onClick={onPrev} aria-label="前へ">
        <IconChevronLeft size={18} />
      </button>
      <span className="periodbar-label">{label}</span>
      <button onClick={onNext} disabled={nextDisabled} aria-label="次へ">
        <IconChevronRight size={18} />
      </button>
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    />
  );
}

/** 前月比などの増減表示。支出が増えていれば赤、減っていれば緑 */
export function Delta({ value, suffix }: { value: number; suffix?: string }) {
  if (value === 0) {
    return (
      <span className="faint">
        ±¥0{suffix}
      </span>
    );
  }
  const up = value > 0;
  const text = `${up ? '+' : '-'}¥${Math.abs(Math.round(value)).toLocaleString('ja-JP')}`;
  return (
    <span className={up ? 'up' : 'down'} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
      {up ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
      {text}
      {suffix}
    </span>
  );
}

/** 選択用のボトムシート */
export function Sheet({
  title,
  onClose,
  children,
  leftAction,
  rightAction,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
}) {
  // Android の戻る操作でアプリを閉じず、このシートだけを閉じる
  useBackClose(true, onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <div>
            {leftAction ?? (
              <button className="link" onClick={onClose}>
                閉じる
              </button>
            )}
          </div>
          <h2 className="sheet-title">{title}</h2>
          <div style={{ textAlign: 'right' }}>{rightAction}</div>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** シート内の選択肢 1 行 */
export function Option({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className={`option ${selected ? 'on' : ''}`} onClick={onClick}>
      <span className="grow row" style={{ gap: 9 }}>
        {children}
      </span>
      {selected && <IconCheck size={17} className="option-check" />}
    </button>
  );
}

/**
 * カテゴリ内訳のドーナツグラフ。
 * ライブラリを足さずに済むよう stroke-dasharray で自前描画する。
 */
export function Donut({
  segments,
  size = 108,
  thickness = 16,
  centerValue,
  centerLabel,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
}) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, x) => s + x.value, 0);

  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const length = (total > 0 ? s.value / total : 0) * circumference;
      const arc = (
        <circle
          key={i}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={s.color}
          strokeWidth={thickness}
          // わずかに短くしてセグメントの境目を見せる
          strokeDasharray={`${Math.max(0, length - 2)} ${circumference}`}
          strokeDashoffset={-offset}
        />
      );
      offset += length;
      return arc;
    });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}
      role="img"
      aria-label="カテゴリ別内訳"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--surface-3)"
        strokeWidth={thickness}
      />
      {arcs}
      {centerValue && (
        <g transform={`rotate(90 ${size / 2} ${size / 2})`}>
          <text
            x={size / 2}
            y={size / 2 + (centerLabel ? 0 : 5)}
            textAnchor="middle"
            className="donut-center-value"
          >
            {centerValue}
          </text>
          {centerLabel && (
            <text x={size / 2} y={size / 2 + 13} textAnchor="middle" className="donut-center-label">
              {centerLabel}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}
