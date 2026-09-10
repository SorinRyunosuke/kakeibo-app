import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { getBudgetForMonth, summarizeMonth, totalFixedExpenses } from '../../lib/budget';
import { formatMonthLabel, toMonthKey } from '../../lib/date';
import { percent, yen } from '../../lib/format';
import { AppBar, Section, Segmented, Sheet, Toggle } from '../../components/ui';
import { IconInfo, IconTarget } from '../../components/icons';
import type { BudgetMode } from '../../types';

// ============================================================================
// 予算設定
//   auto   : 手取り − 固定費 = 自由に使えるお金（推奨）
//   manual : 金額を直接指定
// さらに「今月だけ上書き」も持てるようにする（臨時出費のある月向け）
// ============================================================================

export function BudgetPage({ onBack }: { onBack: () => void }) {
  const { data, updateSettings, setBudgetForMonth, showToast } = useApp();
  const month = toMonthKey(new Date());
  const [editing, setEditing] = useState(false);

  const summary = summarizeMonth(data, month);
  const fixedTotal = totalFixedExpenses(data.fixedExpenses);
  const budget = getBudgetForMonth(month, data.settings, data.budgets, data.fixedExpenses);
  const alerts = data.settings.alerts;

  return (
    <div className="page">
      <AppBar title="予算設定" onBack={onBack} />

      {/* --- 今月の予算 --- */}
      <div className="card">
        <div className="row-between">
          <div className="row">
            <span
              className="tile"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            >
              <IconTarget size={19} />
            </span>
            <div>
              <p className="tiny faint">今月の予算</p>
              <p style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {yen(budget)}
              </p>
            </div>
          </div>
          <button className="link" onClick={() => setEditing(true)}>
            変更
          </button>
        </div>
      </div>

      {/* --- 予算の内訳 --- */}
      <Section title="予算の内訳">
        <div className="card">
          <div className="row-between">
            <div>
              <span className="small">自由に使える金額</span>
              {data.settings.budgetMode === 'auto' && (
                <p className="tiny faint">
                  （手取り {yen(data.settings.income)} − 固定費 {yen(fixedTotal)}）
                </p>
              )}
            </div>
            <b>{yen(budget)}</b>
          </div>

          <div className="divider" />

          <div className="row-between">
            <span className="small">今月の使用額</span>
            <b>{yen(summary.spent)}</b>
          </div>

          <div className="divider" />

          <div className="row-between">
            <span className="small">あと使える金額</span>
            <b style={{ color: summary.remaining < 0 ? 'var(--danger)' : 'var(--primary)' }}>
              {yen(summary.remaining)}
            </b>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="small muted">使用率</span>
              <span className="small bold">{percent(summary.ratio)}%</span>
            </div>
            <div className="bar">
              <div
                className="bar-fill"
                style={{
                  width: `${Math.min(100, Math.max(0, summary.ratio * 100))}%`,
                  background: summary.remaining < 0 ? 'var(--danger)' : 'var(--primary)',
                }}
              />
            </div>
          </div>

          {alerts.at70 && (
            <div className="note" style={{ marginTop: 14 }}>
              <IconInfo size={15} />
              <span>使用率が70%を超えるとお知らせが表示されます。</span>
            </div>
          )}
        </div>
      </Section>

      {/* --- アラート設定 --- */}
      <Section title="予算アラート設定">
        <div className="list">
          {(
            [
              ['at70', '70%でお知らせ'],
              ['at90', '90%でお知らせ'],
              ['at100', '100%でお知らせ'],
            ] as const
          ).map(([key, label]) => (
            <div className="list-row" key={key}>
              <span className="list-row-main">
                <span className="list-row-title">{label}</span>
              </span>
              <Toggle
                on={alerts[key]}
                onChange={(v) => updateSettings({ alerts: { ...alerts, [key]: v } })}
              />
            </div>
          ))}
        </div>
        <p className="hint">
          ダッシュボードに注意の帯を出すかどうかの設定です。オフにしても金額の計算は変わりません。
        </p>
      </Section>

      {editing && (
        <BudgetEditSheet
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            showToast('予算を保存しました');
          }}
        />
      )}
    </div>
  );

  function BudgetEditSheet({
    onClose,
    onSaved,
  }: {
    onClose: () => void;
    onSaved: () => void;
  }) {
    const [mode, setMode] = useState<BudgetMode>(data.settings.budgetMode);
    const [income, setIncome] = useState(String(data.settings.income || ''));
    const [defaultBudget, setDefaultBudget] = useState(String(data.settings.defaultBudget || ''));
    const monthOverride = data.budgets.find((b) => b.month === month);
    const [override, setOverride] = useState(String(monthOverride?.amount ?? ''));

    const autoBudget = Math.max(0, (Number(income) || 0) - fixedTotal);
    const effective =
      override.trim() !== ''
        ? Number(override) || 0
        : mode === 'auto'
          ? autoBudget
          : Number(defaultBudget) || 0;

    const save = () => {
      updateSettings({
        budgetMode: mode,
        income: Number(income) || 0,
        defaultBudget: Number(defaultBudget) || 0,
      });
      setBudgetForMonth(month, override.trim() === '' ? null : Number(override) || 0);
      onSaved();
    };

    return (
      <Sheet
        title="予算を変更"
        onClose={onClose}
        rightAction={
          <button className="link" onClick={save}>
            保存
          </button>
        }
      >
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="tiny faint">{formatMonthLabel(month)}に適用される予算</p>
          <p style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
            {yen(effective)}
          </p>
        </div>

        <div className="field">
          <label className="field-label">決め方</label>
          <Segmented
            options={[
              { value: 'auto', label: '手取りから自動' },
              { value: 'manual', label: '金額を指定' },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>

        {mode === 'auto' ? (
          <>
            <div className="field">
              <label className="field-label">手取り月収</label>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                placeholder="250000"
              />
            </div>
            <div className="card">
              <div className="row-between small">
                <span className="muted">手取り</span>
                <b>{yen(Number(income) || 0)}</b>
              </div>
              <div className="row-between small mt-8">
                <span className="muted">
                  − 固定費（{data.fixedExpenses.filter((f) => f.active).length}件）
                </span>
                <b>{yen(fixedTotal)}</b>
              </div>
              <div className="divider" />
              <div className="row-between">
                <span className="bold">自由に使えるお金</span>
                <b style={{ fontSize: 17, color: 'var(--primary)' }}>{yen(autoBudget)}</b>
              </div>
            </div>
            <p className="hint">
              固定費は「その他 &gt; 固定費」で登録します。ここで差し引いているため、
              固定費として登録した支出が「あと使える金額」から二重に引かれることはありません。
            </p>
          </>
        ) : (
          <div className="field">
            <label className="field-label">毎月の自由に使える金額</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={defaultBudget}
              onChange={(e) => setDefaultBudget(e.target.value)}
              placeholder="80000"
            />
          </div>
        )}

        <div className="divider" />

        <div className="field">
          <label className="field-label">{formatMonthLabel(month)}だけ上書き</label>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            placeholder="通常どおり"
          />
          <p className="hint">旅行など臨時の月に。空欄にすると上書きを解除します。</p>
        </div>

        <button className="btn btn-primary btn-block mt-16" onClick={save}>
          保存する
        </button>
      </Sheet>
    );
  }
}
