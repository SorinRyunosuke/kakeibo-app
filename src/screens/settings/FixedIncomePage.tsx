import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { totalFixedIncomes } from '../../lib/schedule';
import { yen } from '../../lib/format';
import { AppBar, Empty, Segmented, Sheet, Toggle } from '../../components/ui';
import { IconEdit, IconPlus, IconTrash } from '../../components/icons';
import { END_OF_MONTH, WEEKDAYS_JA, type FixedIncome, type RecurrenceFreq } from '../../types';
import { describeRecurrence } from './FixedExpensePage';

// ============================================================================
// 固定収入（給料・バイト代など）
//
// カレンダーの「入金予定」表示にのみ使う。予算計算には影響しない
// （手取りは「予算設定」の入力のまま）。
// ============================================================================

const DAY_OPTIONS = [...Array.from({ length: 28 }, (_, i) => i + 1), END_OF_MONTH];

export function FixedIncomePage({ onBack }: { onBack: () => void }) {
  const { data, updateFixedIncome, deleteFixedIncome, showToast } = useApp();
  const [editing, setEditing] = useState<FixedIncome | 'new' | null>(null);

  const total = totalFixedIncomes(data.fixedIncomes);

  return (
    <div className="page">
      <AppBar title="固定収入" onBack={onBack} />

      <div className="card">
        <p className="tiny faint">月換算の固定収入 合計（参考）</p>
        <p style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--primary)' }}>
          {yen(total)}
        </p>
        <p className="hint">
          予算計算には影響しません。「分析 → カレンダー」で入金予定として表示するためのものです。
        </p>
      </div>

      <div className="list" style={{ marginTop: 14 }}>
        {data.fixedIncomes.length === 0 ? (
          <Empty icon="💰">
            給料・バイト代などを登録しておくと、
            <br />
            カレンダーに入金予定が表示されます。
          </Empty>
        ) : (
          data.fixedIncomes.map((i) => (
            <div className="list-row" key={i.id}>
              <span
                className="tile"
                style={{
                  background: 'color-mix(in srgb, var(--primary) 14%, #fff)',
                  opacity: i.active ? 1 : 0.4,
                }}
              >
                💰
              </span>
              <span className="list-row-main" style={{ opacity: i.active ? 1 : 0.5 }}>
                <span className="list-row-title">{i.name}</span>
                <span className="list-row-sub">{describeRecurrence(i)}</span>
              </span>
              <span
                className="small bold"
                style={{ opacity: i.active ? 1 : 0.5, color: 'var(--primary)' }}
              >
                {yen(i.amount)}
              </span>
              <Toggle on={i.active} onChange={(v) => updateFixedIncome(i.id, { active: v })} />
              <button className="icon-btn" onClick={() => setEditing(i)} aria-label="編集">
                <IconEdit size={15} />
              </button>
              <button
                className="icon-btn"
                aria-label="削除"
                onClick={() => {
                  if (!confirm(`「${i.name}」を削除しますか？`)) return;
                  deleteFixedIncome(i.id);
                  showToast('固定収入を削除しました');
                }}
              >
                <IconTrash size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <button className="btn-add mt-12" onClick={() => setEditing('new')}>
        <IconPlus size={16} /> 固定収入を追加
      </button>

      {editing && (
        <IncomeEditor item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function IncomeEditor({ item, onClose }: { item: FixedIncome | null; onClose: () => void }) {
  const { addFixedIncome, updateFixedIncome, showToast } = useApp();

  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(String(item?.amount ?? ''));
  const [freq, setFreq] = useState<RecurrenceFreq>(item?.freq ?? 'monthly');
  const [paymentDay, setPaymentDay] = useState(item?.paymentDay ?? 25);
  const [weekday, setWeekday] = useState(item?.weekday ?? 5);

  const canSave = name.trim().length > 0 && Number(amount) > 0;

  const save = () => {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      amount: Math.round(Number(amount)),
      freq,
      paymentDay,
      weekday: freq === 'weekly' ? weekday : undefined,
      active: item?.active ?? true,
    };
    if (item) {
      updateFixedIncome(item.id, payload);
      showToast('固定収入を更新しました');
    } else {
      addFixedIncome(payload);
      showToast('固定収入を追加しました');
    }
    onClose();
  };

  return (
    <Sheet
      title={item ? '固定収入を編集' : '固定収入を追加'}
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
          placeholder="例: 給料 / バイト代"
          autoFocus
        />
      </div>

      <div className="field">
        <label className="field-label">金額</label>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="250000"
        />
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
          <label className="field-label">入金日</label>
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

      <button className="btn btn-primary btn-block mt-16" onClick={save} disabled={!canSave}>
        保存する
      </button>
    </Sheet>
  );
}
