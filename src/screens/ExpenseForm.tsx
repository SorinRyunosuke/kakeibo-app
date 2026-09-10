import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { PAYMENT_METHODS, type Expense, type PaymentMethod } from '../types';
import { getBillingCycleFor } from '../lib/creditCard';
import { formatShortDate, todayISO } from '../lib/date';
import { num, yen } from '../lib/format';
import { Option, Sheet } from '../components/ui';
import { useBackClose } from '../lib/useBackClose';
import { ReceiptScan, type ReceiptPick } from './ReceiptScan';
import {
  IconCalendar,
  IconCamera,
  IconCard,
  IconChevronRight,
  IconClose,
  IconNote,
  IconTag,
  IconWallet,
} from '../components/icons';

// ============================================================================
// 支出の登録・編集（フルスクリーン）
//
// 目標操作数: [＋] -> 金額をキーパッドで入力 -> カテゴリを選ぶ -> 保存。
// 日付は今日、支払方法は前回値を初期値にして、触らなくても保存できるようにする。
// ============================================================================

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const w = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')} (${w})`;
}

type Picker = 'method' | 'card' | 'category' | null;

export function ExpenseForm({
  editing,
  onClose,
}: {
  /** 編集時は既存の支出、新規登録時は undefined */
  editing?: Expense;
  onClose: () => void;
}) {
  const { data, addExpense, updateExpense, deleteExpense, showToast } = useApp();
  const { categories, creditCards, settings } = data;
  const activeCards = useMemo(() => creditCards.filter((c) => !c.archived), [creditCards]);

  const [amount, setAmount] = useState<string>(editing ? String(editing.amount) : '');
  const [date, setDate] = useState(editing?.date ?? todayISO());
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? categories[0]?.id ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    editing?.paymentMethod ?? settings.lastPaymentMethod ?? 'cash',
  );
  const [creditCardId, setCreditCardId] = useState<string>(
    editing?.creditCardId ?? settings.lastCreditCardId ?? activeCards[0]?.id ?? '',
  );
  const [merchant, setMerchant] = useState(editing?.merchant ?? '');
  const [picker, setPicker] = useState<Picker>(null);
  const [scanning, setScanning] = useState(false);

  /** レシート読み取りの結果を各項目に流し込む。読めなかった項目は今の値のまま */
  const applyReceipt = (pick: ReceiptPick) => {
    if (pick.amount) setAmount(String(pick.amount));
    if (pick.date) setDate(pick.date);
    if (pick.merchant) setMerchant(pick.merchant);
    showToast('読み取った内容を入力しました');
  };

  // Android の戻る操作で登録画面を閉じる（アプリごと閉じさせない）
  useBackClose(true, onClose);

  // 開いている間は背面をスクロールさせない
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const numericAmount = Number(amount) || 0;
  const canSave = numericAmount > 0 && !!categoryId;

  const category = categories.find((c) => c.id === categoryId);
  const card = creditCards.find((c) => c.id === creditCardId);
  const method = PAYMENT_METHODS.find((p) => p.value === paymentMethod);

  // クレカ払いのとき、この支出がいつ引き落とされるかを即座に示す
  const billing = useMemo(() => {
    if (paymentMethod !== 'credit' || !card) return null;
    return getBillingCycleFor(card, date);
  }, [paymentMethod, card, date]);

  // --- キーパッド ------------------------------------------------------------
  const press = (key: string) => {
    setAmount((cur) => {
      if (key === 'del') return cur.slice(0, -1);
      const next = cur === '0' ? key : cur + key;
      // 現実的でない桁数は弾く（9桁 = 1億未満）
      return next.replace(/^0+(?=\d)/, '').slice(0, 9);
    });
  };

  const handleSave = () => {
    if (!canSave) return;
    const payload = {
      amount: Math.round(numericAmount),
      date,
      categoryId,
      paymentMethod,
      creditCardId: paymentMethod === 'credit' ? creditCardId || undefined : undefined,
      merchant: merchant.trim() || undefined,
      memo: editing?.memo,
    };

    if (editing) {
      updateExpense(editing.id, payload);
      showToast('支出を更新しました');
    } else {
      addExpense(payload);
      showToast(`${yen(payload.amount)} を登録しました`);
    }
    onClose();
  };

  const handleDelete = () => {
    if (!editing) return;
    if (!confirm('この支出を削除しますか？')) return;
    deleteExpense(editing.id);
    showToast('支出を削除しました');
    onClose();
  };

  return (
    <div className="fullscreen">
      <div className="fullscreen-inner">
        <header className="appbar" style={{ padding: '12px 16px' }}>
          <button className="appbar-btn" onClick={onClose} aria-label="閉じる">
            <IconClose size={21} />
          </button>
          <h1 className="appbar-title">{editing ? '支出を編集' : '支出登録'}</h1>
          <div style={{ display: 'grid', placeItems: 'center' }}>
            {editing && (
              <button className="appbar-btn" onClick={handleDelete} aria-label="削除">
                <span style={{ color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>削除</span>
              </button>
            )}
          </div>
        </header>

        <div className="fullscreen-body">
          {/* --- 金額表示 --- */}
          <div className="amount-box">
            <span className="amount-yen">¥</span>
            <span className={`amount-value ${numericAmount === 0 ? 'is-zero' : ''}`}>
              {numericAmount === 0 ? '0' : num(numericAmount)}
            </span>
            {amount !== '' && (
              <button className="amount-clear" onClick={() => setAmount('')} aria-label="クリア">
                <IconClose size={14} />
              </button>
            )}
          </div>

          {/* --- レシート読み取り --- */}
          <button className="btn btn-outline btn-sm btn-block mt-8" onClick={() => setScanning(true)}>
            <IconCamera size={16} /> レシートを読み取る
          </button>

          {/* --- キーパッド --- */}
          <div className="keypad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((k) => (
              <button key={k} className="key" onClick={() => press(k)}>
                {k}
              </button>
            ))}
            <button className="key" onClick={() => press('del')} aria-label="1文字削除">
              ⌫
            </button>
          </div>

          {/* --- 入力項目 --- */}
          <div style={{ marginTop: 16 }}>
            {/* 日付: 行全体をタップするとネイティブの日付ピッカーが開く */}
            <div className="form-row">
              <IconCalendar size={17} className="faint" />
              <span className="form-row-label grow">日付</span>
              <span className="form-row-value">{formatDateLabel(date)}</span>
              <IconChevronRight size={15} className="chevron" />
              <input
                className="form-row-dateinput"
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                aria-label="日付"
              />
            </div>

            <button className="form-row" onClick={() => setPicker('method')}>
              <IconWallet size={17} className="faint" />
              <span className="form-row-label grow">支払方法</span>
              <span className="form-row-value">
                {method?.icon} {method?.label}
              </span>
              <IconChevronRight size={15} className="chevron" />
            </button>

            {paymentMethod === 'credit' && (
              <button
                className="form-row"
                onClick={() => activeCards.length > 0 && setPicker('card')}
              >
                <IconCard size={17} className="faint" />
                <span className="form-row-label grow">カード</span>
                <span className="form-row-value">
                  {activeCards.length === 0 ? '未登録' : (card?.name ?? '選択してください')}
                </span>
                <IconChevronRight size={15} className="chevron" />
              </button>
            )}

            <button className="form-row" onClick={() => setPicker('category')}>
              <IconTag size={17} className="faint" />
              <span className="form-row-label grow">カテゴリ</span>
              <span className="form-row-value">
                {category ? `${category.icon} ${category.name}` : '選択してください'}
              </span>
              <IconChevronRight size={15} className="chevron" />
            </button>

            <div className="form-row form-row-stack">
              <span className="form-row-label">
                <IconNote size={14} style={{ display: 'inline', verticalAlign: -2 }} /> 店名・メモ
              </span>
              <input
                className="inline-input"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="任意（例: セブンイレブン）"
              />
            </div>

            {billing && (
              <p className="hint">
                この支出は {formatShortDate(billing.closingDate)} 締め →{' '}
                <b>{formatShortDate(billing.paymentDate)} 引き落とし</b> に含まれます
              </p>
            )}
            {paymentMethod === 'credit' && activeCards.length === 0 && (
              <p className="hint">
                カードが未登録です。「その他」＞ クレジットカード から追加すると、
                次回請求額に自動で反映されます。
              </p>
            )}
          </div>
        </div>

        <div className="fullscreen-foot">
          <button className="btn btn-primary btn-block" onClick={handleSave} disabled={!canSave}>
            保存
          </button>
        </div>
      </div>

      {scanning && (
        <ReceiptScan onClose={() => setScanning(false)} onApply={applyReceipt} />
      )}

      {/* --- 選択シート --- */}
      {picker === 'method' && (
        <Sheet title="支払方法" onClose={() => setPicker(null)}>
          {PAYMENT_METHODS.map((p) => (
            <Option
              key={p.value}
              selected={paymentMethod === p.value}
              onClick={() => {
                setPaymentMethod(p.value);
                setPicker(p.value === 'credit' && activeCards.length > 0 ? 'card' : null);
              }}
            >
              <span>{p.icon}</span>
              <span className="grow">{p.label}</span>
            </Option>
          ))}
        </Sheet>
      )}

      {picker === 'card' && (
        <Sheet title="カード" onClose={() => setPicker(null)}>
          {activeCards.map((c) => (
            <Option
              key={c.id}
              selected={creditCardId === c.id}
              onClick={() => {
                setCreditCardId(c.id);
                setPicker(null);
              }}
            >
              <span
                className="tile"
                style={{ background: `color-mix(in srgb, ${c.color} 16%, #fff)`, fontSize: 14 }}
              >
                💳
              </span>
              <span className="grow">{c.name}</span>
            </Option>
          ))}
        </Sheet>
      )}

      {picker === 'category' && (
        <Sheet title="カテゴリ" onClose={() => setPicker(null)}>
          {[...categories]
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
      )}
    </div>
  );
}
