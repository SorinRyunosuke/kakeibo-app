import { useApp } from '../store/AppContext';
import { formatRelativeDate, formatShortDate } from '../lib/date';
import { yen } from '../lib/format';
import { PAYMENT_METHODS, type Expense } from '../types';
import { IconChevronRight } from './icons';

/** 支出 1 件の行。ダッシュボード・支出一覧・カード明細で共用する */
export function ExpenseRow({
  expense,
  onClick,
  /** 右端に日付を出す（ダッシュボードの「最近の支出」用） */
  trailingDate = false,
  /** 副題に日付を含める（日付でグルーピングしていない場所用） */
  showDate = false,
}: {
  expense: Expense;
  onClick: () => void;
  trailingDate?: boolean;
  showDate?: boolean;
}) {
  const { data } = useApp();
  const category = data.categories.find((c) => c.id === expense.categoryId);
  const card = expense.creditCardId
    ? data.creditCards.find((c) => c.id === expense.creditCardId)
    : undefined;
  const method = PAYMENT_METHODS.find((p) => p.value === expense.paymentMethod);
  const color = category?.color ?? '#8fa0b5';

  // 店名があればそれを主題に、なければカテゴリ名を主題にする
  const title = expense.merchant?.trim() || category?.name || 'その他';
  const subParts = [
    showDate ? formatRelativeDate(expense.date) : null,
    expense.merchant ? (category?.name ?? null) : null,
    card ? card.name : (method?.label ?? null),
  ].filter(Boolean);

  return (
    <button className="list-row" onClick={onClick}>
      <span
        className="tile"
        style={{ background: `color-mix(in srgb, ${color} 16%, #fff)` }}
      >
        {category?.icon ?? '📦'}
      </span>

      <span className="list-row-main">
        <span className="list-row-title">{title}</span>
        <span className="list-row-sub">{subParts.join(' · ')}</span>
      </span>

      <span style={{ textAlign: 'right' }}>
        <span className="list-row-value" style={{ display: 'block' }}>
          {yen(expense.amount)}
        </span>
        {trailingDate && (
          <span className="tiny faint" style={{ display: 'block' }}>
            {formatShortDate(expense.date)}
          </span>
        )}
      </span>

      <IconChevronRight size={16} className="chevron" />
    </button>
  );
}
