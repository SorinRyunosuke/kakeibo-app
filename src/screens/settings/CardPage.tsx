import { useMemo, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { describeCardCycle, summarizeCard, summarizeCards } from '../../lib/creditCard';
import { formatShortDate } from '../../lib/date';
import { yen } from '../../lib/format';
import { AppBar, Empty, Section, Segmented, Sheet } from '../../components/ui';
import { IconCard, IconChevronRight, IconEdit, IconPlus } from '../../components/icons';
import { END_OF_MONTH, type CreditCard } from '../../types';

// ============================================================================
// クレジットカード画面
// 先頭に「主役の1枚」の次回引き落とし予定を大きく出し、下に登録カード一覧を並べる。
// ============================================================================

const CARD_COLORS = [
  '#bf0000',
  '#0a8f61',
  '#2563eb',
  '#f59e0b',
  '#7c3aed',
  '#0891b2',
  '#db2777',
  '#475569',
];

const PRESETS: { label: string; closingDay: number; paymentDay: number; offset: number }[] = [
  { label: '月末締め 翌月27日払い', closingDay: END_OF_MONTH, paymentDay: 27, offset: 1 },
  { label: '月末締め 翌月26日払い', closingDay: END_OF_MONTH, paymentDay: 26, offset: 1 },
  { label: '月末締め 翌月10日払い', closingDay: END_OF_MONTH, paymentDay: 10, offset: 1 },
  { label: '15日締め 翌月10日払い', closingDay: 15, paymentDay: 10, offset: 1 },
  { label: '25日締め 翌月10日払い', closingDay: 25, paymentDay: 10, offset: 1 },
  { label: '5日締め 当月26日払い', closingDay: 5, paymentDay: 26, offset: 0 },
];

const DAY_OPTIONS = [...Array.from({ length: 28 }, (_, i) => i + 1), END_OF_MONTH];

const dayLabel = (d: number) => (d === END_OF_MONTH ? '月末' : `${d}日`);

export function CardPage({
  onBack,
  onOpenDetail,
}: {
  onBack: () => void;
  onOpenDetail: (card: CreditCard) => void;
}) {
  const { data } = useApp();
  const [editing, setEditing] = useState<CreditCard | 'new' | null>(null);
  const today = new Date();

  const overview = useMemo(
    () => summarizeCards(data.creditCards, data.expenses, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.creditCards, data.expenses],
  );

  // 一覧の先頭カードを大きく見せる
  const primary = overview.summaries[0] ?? null;

  return (
    <div className="page">
      <AppBar title="クレジットカード" onBack={onBack} />

      {data.creditCards.length === 0 ? (
        <div className="card">
          <Empty icon="💳">
            カードを登録すると、支出を入れるだけで
            <br />
            次回引き落とし額が自動計算されます。
          </Empty>
        </div>
      ) : (
        primary && (
          <div className="card">
            <div className="row-between">
              <div className="row">
                <span
                  className="tile"
                  style={{
                    background: `color-mix(in srgb, ${primary.card.color} 14%, #fff)`,
                    color: primary.card.color,
                    width: 42,
                    height: 42,
                  }}
                >
                  <IconCard size={21} />
                </span>
                <div>
                  <p className="bold" style={{ fontSize: 15 }}>
                    {primary.card.name}
                  </p>
                  <p className="tiny faint">
                    締め日 {dayLabel(primary.card.closingDay)} / 支払日{' '}
                    {primary.card.paymentMonthOffset === 0
                      ? '当月'
                      : primary.card.paymentMonthOffset === 1
                        ? '翌月'
                        : '翌々月'}
                    {dayLabel(primary.card.paymentDay)}
                  </p>
                </div>
              </div>
              <button
                className="icon-btn"
                onClick={() => setEditing(primary.card)}
                aria-label="編集"
              >
                <IconEdit size={16} />
              </button>
            </div>

            {/* 次回引き落とし予定 */}
            <div
              style={{
                marginTop: 14,
                background: 'var(--primary-tint)',
                borderRadius: 'var(--radius)',
                padding: '13px 14px',
              }}
            >
              <p className="tiny muted">
                次回引き落とし予定
                {primary.next && `（${formatShortDate(primary.next.paymentDate)}）`}
              </p>
              <p style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {yen(primary.next?.amount ?? 0)}
              </p>
              <div className="row" style={{ marginTop: 10, gap: 0 }}>
                <div className="grow">
                  <p className="tiny faint">確定済み</p>
                  <p className="bold">{yen(primary.confirmedTotal)}</p>
                </div>
                <div
                  style={{ width: 1, alignSelf: 'stretch', background: 'var(--border-strong)' }}
                />
                <div className="grow" style={{ paddingLeft: 14 }}>
                  <p className="tiny faint">未確定</p>
                  <p className="bold">{yen(primary.unconfirmedTotal)}</p>
                </div>
              </div>
            </div>

            <button
              className="btn btn-outline btn-block btn-sm mt-12"
              onClick={() => onOpenDetail(primary.card)}
            >
              利用明細をみる
            </button>
          </div>
        )
      )}

      <Section title="登録カード一覧">
        <div className="list">
          {overview.summaries.map((s) => (
            <button key={s.card.id} className="list-row" onClick={() => onOpenDetail(s.card)}>
              <span
                className="tile"
                style={{
                  background: `color-mix(in srgb, ${s.card.color} 14%, #fff)`,
                  color: s.card.color,
                }}
              >
                <IconCard size={18} />
              </span>
              <span className="list-row-main">
                <span className="list-row-title">{s.card.name}</span>
                <span className="list-row-sub">次回請求予定</span>
              </span>
              <span className="list-row-value">{yen(s.next?.amount ?? 0)}</span>
              <IconChevronRight size={16} className="chevron" />
            </button>
          ))}

          {data.creditCards
            .filter((c) => c.archived)
            .map((c) => (
              <button key={c.id} className="list-row" onClick={() => setEditing(c)}>
                <span className="tile" style={{ background: 'var(--surface-2)' }}>
                  <IconCard size={18} />
                </span>
                <span className="list-row-main">
                  <span className="list-row-title">
                    {c.name} <span className="badge">停止中</span>
                  </span>
                  <span className="list-row-sub">集計から外しています</span>
                </span>
                <IconChevronRight size={16} className="chevron" />
              </button>
            ))}
        </div>

        <button className="btn-add mt-12" onClick={() => setEditing('new')}>
          <IconPlus size={16} /> カードを追加
        </button>
      </Section>

      {editing && (
        <CardEditor card={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function CardEditor({ card, onClose }: { card: CreditCard | null; onClose: () => void }) {
  const { data, addCard, updateCard, deleteCard, showToast } = useApp();

  const [name, setName] = useState(card?.name ?? '');
  const [closingDay, setClosingDay] = useState(card?.closingDay ?? END_OF_MONTH);
  const [paymentDay, setPaymentDay] = useState(card?.paymentDay ?? 27);
  const [offset, setOffset] = useState(card?.paymentMonthOffset ?? 1);
  const [color, setColor] = useState(card?.color ?? CARD_COLORS[0]);
  const [archived, setArchived] = useState(card?.archived ?? false);

  const preview = describeCardCycle({
    closingDay,
    paymentDay,
    paymentMonthOffset: offset,
  } as CreditCard);

  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      closingDay,
      paymentDay,
      paymentMonthOffset: offset,
      color,
      archived,
    };
    if (card) {
      updateCard(card.id, payload);
      showToast('カードを更新しました');
    } else {
      addCard(payload);
      showToast('カードを追加しました');
    }
    onClose();
  };

  const unpaid = card ? summarizeCard(card, data.expenses).unpaidTotal : 0;

  return (
    <Sheet
      title={card ? 'カードを編集' : 'カードを追加'}
      onClose={onClose}
      rightAction={
        <button className="link" onClick={save} style={{ opacity: canSave ? 1 : 0.35 }}>
          保存
        </button>
      }
    >
      <div className="field">
        <label className="field-label">カード名</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="楽天カード"
          autoFocus
        />
      </div>

      <div className="field">
        <label className="field-label">よくある設定から選ぶ</label>
        <div className="chips">
          {PRESETS.map((p) => {
            const on =
              p.closingDay === closingDay && p.paymentDay === paymentDay && p.offset === offset;
            return (
              <button
                key={p.label}
                className={`chip ${on ? 'on' : ''}`}
                onClick={() => {
                  setClosingDay(p.closingDay);
                  setPaymentDay(p.paymentDay);
                  setOffset(p.offset);
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div className="field grow">
          <label className="field-label">締め日</label>
          <select
            className="select"
            value={closingDay}
            onChange={(e) => setClosingDay(Number(e.target.value))}
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label className="field-label">支払月</label>
          <select
            className="select"
            value={offset}
            onChange={(e) => setOffset(Number(e.target.value))}
          >
            <option value={0}>当月</option>
            <option value={1}>翌月</option>
            <option value={2}>翌々月</option>
          </select>
        </div>
        <div className="field grow">
          <label className="field-label">支払日</label>
          <select
            className="select"
            value={paymentDay}
            onChange={(e) => setPaymentDay(Number(e.target.value))}
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {dayLabel(d)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="note">
        <span>
          請求サイクル: <b style={{ color: 'var(--text)' }}>{preview}</b>
          <br />
          締め日の翌日以降に使った分は次の請求に回ります。
        </span>
      </div>

      <div className="field mt-16">
        <label className="field-label">色</label>
        <div className="chips">
          {CARD_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              aria-label={`色 ${c}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: c,
                border: color === c ? '3px solid var(--text)' : '1px solid var(--border)',
              }}
            />
          ))}
        </div>
      </div>

      {card && (
        <>
          <div className="field">
            <label className="field-label">このカードの状態</label>
            <Segmented
              plain
              options={[
                { value: 'active', label: '使用中' },
                { value: 'archived', label: '停止中' },
              ]}
              value={archived ? 'archived' : 'active'}
              onChange={(v) => setArchived(v === 'archived')}
            />
            <p className="hint">停止中にすると集計と支出登録の選択肢から外れます（データは残ります）。</p>
          </div>

          <button
            className="btn btn-danger btn-block"
            onClick={() => {
              const extra =
                unpaid > 0 ? `\n未払い ${yen(unpaid)} 分の支出は「その他」払いとして残ります。` : '';
              if (!confirm(`「${card.name}」を削除しますか？${extra}`)) return;
              deleteCard(card.id);
              showToast('カードを削除しました');
              onClose();
            }}
          >
            このカードを削除
          </button>
        </>
      )}

      <button className="btn btn-primary btn-block mt-16" onClick={save} disabled={!canSave}>
        保存する
      </button>
    </Sheet>
  );
}
