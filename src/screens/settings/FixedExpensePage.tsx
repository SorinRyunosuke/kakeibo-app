import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { totalFixedExpenses } from '../../lib/budget';
import { yen } from '../../lib/format';
import { AppBar, Empty, Option, Segmented, Sheet, Toggle } from '../../components/ui';
import { IconEdit, IconPlus, IconTrash } from '../../components/icons';
import {
  END_OF_MONTH,
  PAYMENT_METHODS,
  WEEKDAYS_JA,
  type FixedExpense,
  type PaymentMethod,
  type RecurrenceFreq,
} from '../../types';

// ============================================================================
// 固定費（家賃・携帯・サブスク・保険・光熱費など）
//
// ここに登録した金額は「手取り − 固定費 = 自由に使えるお金」の計算に使う。
// 毎週◯円は月換算（×52/12）して予算から引く。
// 実支出としての自動登録はしない（二重計上を避けるため）。
// ============================================================================

const DAY_OPTIONS = [...Array.from({ length: 28 }, (_, i) => i + 1), END_OF_MONTH];

/** 固定費 / 固定収入の周期を「毎月25日」「毎週火曜」の形にする */
export function describeRecurrence(item: {
  freq: RecurrenceFreq;
  paymentDay: number;
  weekday?: number;
}): string {
  if (item.freq === 'weekly') return `毎週${WEEKDAYS_JA[item.weekday ?? 0]}曜`;
  return item.paymentDay === END_OF_MONTH ? '毎月末' : `毎月${item.paymentDay}日`;
}

export function FixedExpensePage({ onBack }: { onBack: () => void }) {
  const { data, updateFixedExpense, deleteFixedExpense, showToast } = useApp();
  const [editing, setEditing] = useState<FixedExpense | 'new' | null>(null);

  const total = totalFixedExpenses(data.fixedExpenses);

  return (
    <div className="page">
      <AppBar title="固定費" onBack={onBack} />

      <div className="card">
        <p className="tiny faint">毎月の固定費合計（有効なもの）</p>
        <p style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em' }}>{yen(total)}</p>
        <p className="hint">
          予算モードが「手取りから自動」のとき、この金額が手取りから差し引かれます。
        </p>
      </div>

      <div className="list" style={{ marginTop: 14 }}>
        {data.fixedExpenses.length === 0 ? (
          <Empty icon="🔁">
            家賃・携帯・サブスク・保険・光熱費などを
            <br />
            登録しておくと予算が自動計算されます。
          </Empty>
        ) : (
          data.fixedExpenses.map((f) => {
            const cat = data.categories.find((c) => c.id === f.categoryId);
            const card = f.creditCardId
              ? data.creditCards.find((c) => c.id === f.creditCardId)
              : undefined;
            return (
              <div className="list-row" key={f.id}>
                <span
                  className="tile"
                  style={{
                    background: `color-mix(in srgb, ${cat?.color ?? '#8fa0b5'} 16%, #fff)`,
                    opacity: f.active ? 1 : 0.4,
                  }}
                >
                  {cat?.icon ?? '📦'}
                </span>
                <span className="list-row-main" style={{ opacity: f.active ? 1 : 0.5 }}>
                  <span className="list-row-title">{f.name}</span>
                  <span className="list-row-sub">
                    {describeRecurrence(f)} ·{' '}
                    {card
                      ? card.name
                      : PAYMENT_METHODS.find((p) => p.value === f.paymentMethod)?.label}
                  </span>
                </span>
                <span className="small bold" style={{ opacity: f.active ? 1 : 0.5 }}>
                  {yen(f.amount)}
                </span>
                <Toggle on={f.active} onChange={(v) => updateFixedExpense(f.id, { active: v })} />
                <button className="icon-btn" onClick={() => setEditing(f)} aria-label="編集">
                  <IconEdit size={15} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="削除"
                  onClick={() => {
                    if (!confirm(`「${f.name}」を削除しますか？`)) return;
                    deleteFixedExpense(f.id);
                    showToast('固定費を削除しました');
                  }}
                >
                  <IconTrash size={15} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <button className="btn-add mt-12" onClick={() => setEditing('new')}>
        <IconPlus size={16} /> 固定費を追加
      </button>

      {editing && (
        <FixedEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function FixedEditor({ item, onClose }: { item: FixedExpense | null; onClose: () => void }) {
  const { data, addFixedExpense, updateFixedExpense, showToast } = useApp();
  const activeCards = data.creditCards.filter((c) => !c.archived);

  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(String(item?.amount ?? ''));
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? data.categories[0]?.id ?? '');
  const [freq, setFreq] = useState<RecurrenceFreq>(item?.freq ?? 'monthly');
  const [paymentDay, setPaymentDay] = useState(item?.paymentDay ?? 27);
  const [weekday, setWeekday] = useState(item?.weekday ?? 1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(item?.paymentMethod ?? 'bank');
  const [creditCardId, setCreditCardId] = useState(item?.creditCardId ?? activeCards[0]?.id ?? '');
  const [picker, setPicker] = useState<'category' | null>(null);

  const canSave = name.trim().length > 0 && Number(amount) > 0;
  const category = data.categories.find((c) => c.id === categoryId);

  const save = () => {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      amount: Math.round(Number(amount)),
      categoryId,
      freq,
      paymentDay,
      weekday: freq === 'weekly' ? weekday : undefined,
      paymentMethod,
      creditCardId: paymentMethod === 'credit' ? creditCardId || undefined : undefined,
      active: item?.active ?? true,
    };
    if (item) {
      updateFixedExpense(item.id, payload);
      showToast('固定費を更新しました');
    } else {
      addFixedExpense(payload);
      showToast('固定費を追加しました');
    }
    onClose();
  };

  if (picker === 'category') {
    return (
      <Sheet title="カテゴリ" onClose={() => setPicker(null)}>
        {[...data.categories]
          .sort((a, b) => a.order - b.order)
          .map((c) => (
            <Option
              key={c.id}
              selected={categoryId === c.id}
              onClick={() => {
                setCategoryId(c.id);
                setPicker(null);
              }}
            >
              <span
                className="tile"
                style={{ background: `color-mix(in srgb, ${c.color} 16%, #fff)`, fontSize: 15 }}
              >
                {c.icon}
              </span>
              <span className="grow">{c.name}</span>
            </Option>
          ))}
      </Sheet>
    );
  }

  return (
    <Sheet
      title={item ? '固定費を編集' : '固定費を追加'}
      onClose={onClose}
      rightAction={
        <button className="link" onClick={save} style={{ opacity: canSave ? 1 : 0.35 }}>
          保存
        </button>
      }
    >
      <div className="field">
        <label className="field-label">名前</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: 家賃 / Netflix / 携帯料金"
          autoFocus
        />
      </div>

      <div className="field">
        <label className="field-label">月額</label>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="80000"
        />
      </div>

      <div className="field">
        <label className="field-label">カテゴリ</label>
        <button className="form-row" onClick={() => setPicker('category')}>
          <span className="grow row" style={{ gap: 9 }}>
            <span
              className="tile"
              style={{
                background: `color-mix(in srgb, ${category?.color ?? '#8fa0b5'} 16%, #fff)`,
                fontSize: 15,
              }}
            >
              {category?.icon ?? '📦'}
            </span>
            <span>{category?.name ?? '選択してください'}</span>
          </span>
          <span className="chevron">›</span>
        </button>
      </div>

      <div className="field">
        <label className="field-label">周期</label>
        <Segmented
          options={[
            { value: 'monthly', label: '毎月' },
            { value: 'weekly', label: '毎週' },
          ]}
          value={freq}
          onChange={setFreq}
        />
      </div>

      {freq === 'monthly' ? (
        <div className="field">
          <label className="field-label">支払日</label>
          <select
            className="select"
            value={paymentDay}
            onChange={(e) => setPaymentDay(Number(e.target.value))}
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d === END_OF_MONTH ? '毎月末' : `毎月${d}日`}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="field">
          <label className="field-label">曜日</label>
          <select
            className="select"
            value={weekday}
            onChange={(e) => setWeekday(Number(e.target.value))}
          >
            {WEEKDAYS_JA.map((w, i) => (
              <option key={i} value={i}>
                毎週{w}曜
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label className="field-label">支払方法</label>
        <div className="chips">
          {PAYMENT_METHODS.map((p) => (
            <button
              key={p.value}
              className={`chip ${paymentMethod === p.value ? 'on' : ''}`}
              onClick={() => setPaymentMethod(p.value)}
            >
              {p.icon} {p.label}
            </button>
          ))}
        </div>
      </div>

      {paymentMethod === 'credit' && activeCards.length > 0 && (
        <div className="field">
          <label className="field-label">カード</label>
          <div className="chips">
            {activeCards.map((c) => (
              <button
                key={c.id}
                className={`chip ${creditCardId === c.id ? 'on' : ''}`}
                onClick={() => setCreditCardId(c.id)}
              >
                💳 {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="btn btn-primary btn-block mt-16" onClick={save} disabled={!canSave}>
        保存する
      </button>
    </Sheet>
  );
}
