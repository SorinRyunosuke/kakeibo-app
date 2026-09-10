import { useMemo, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { AppBar, Segmented, Sheet } from '../../components/ui';
import { IconChevronRight, IconPlus, IconTrash } from '../../components/icons';
import { DEFAULT_CATEGORIES } from '../../storage/schema';
import type { Category } from '../../types';

// ============================================================================
// カテゴリ管理。初期カテゴリと自分で追加したカテゴリを分けて表示する。
// ============================================================================

const PALETTE = [
  '#ff8c42', '#ff6b9d', '#2bc4b4', '#3f7fd8', '#22c3e6', '#3dd68c', '#9b7bf0',
  '#f4823c', '#ef5f6b', '#19b8a6', '#4cb782', '#efb041', '#5b9df9', '#8fa0b5',
];

const ICONS = [
  '🍚', '🍜', '🏪', '🧴', '🚃', '🎮', '👕', '💇', '💊', '📺', '🏠', '💡',
  '📱', '📦', '🎁', '✈️', '🐶', '📚', '🍺', '⛽', '💰', '🎫',
];

const DEFAULT_IDS = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

type Tab = 'standard' | 'custom';

export function CategoryPage({ onBack }: { onBack: () => void }) {
  const { data, deleteCategory, showToast } = useApp();
  const [tab, setTab] = useState<Tab>('standard');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  // カテゴリごとの利用件数。削除の影響を事前に見せる
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of data.expenses) m.set(e.categoryId, (m.get(e.categoryId) ?? 0) + 1);
    return m;
  }, [data.expenses]);

  const list = useMemo(
    () =>
      [...data.categories]
        .filter((c) => (tab === 'standard' ? DEFAULT_IDS.has(c.id) : !DEFAULT_IDS.has(c.id)))
        .sort((a, b) => a.order - b.order),
    [data.categories, tab],
  );

  return (
    <div className="page">
      <AppBar title="カテゴリ管理" onBack={onBack} />

      <Segmented
        plain
        options={[
          { value: 'standard', label: '標準カテゴリ' },
          { value: 'custom', label: 'カスタム' },
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="list" style={{ marginTop: 14 }}>
        {list.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">🏷</span>
            自分で追加したカテゴリはまだありません。
          </div>
        ) : (
          list.map((c) => {
            const count = usage.get(c.id) ?? 0;
            return (
              <div className="list-row" key={c.id}>
                <button
                  className="row grow"
                  style={{ gap: 11, minWidth: 0, textAlign: 'left' }}
                  onClick={() => setEditing(c)}
                >
                  <span className="tile-solid" style={{ background: c.color, color: '#fff' }}>
                    {c.icon}
                  </span>
                  <span className="list-row-main">
                    <span className="list-row-title">{c.name}</span>
                    <span className="list-row-sub">
                      {count > 0 ? `${count}件の支出で使用中` : '未使用'}
                    </span>
                  </span>
                </button>
                <button
                  className="icon-btn"
                  aria-label={`${c.name}を削除`}
                  disabled={data.categories.length <= 1}
                  onClick={() => {
                    const msg =
                      count > 0
                        ? `「${c.name}」を削除しますか？\n${count}件の支出は「その他」に移動します。`
                        : `「${c.name}」を削除しますか？`;
                    if (!confirm(msg)) return;
                    deleteCategory(c.id);
                    showToast('カテゴリを削除しました');
                  }}
                >
                  <IconTrash size={16} />
                </button>
                <IconChevronRight size={16} className="chevron" />
              </div>
            );
          })
        )}
      </div>

      <button className="btn-add mt-12" onClick={() => setEditing('new')}>
        <IconPlus size={16} /> カテゴリを追加
      </button>

      {editing && (
        <CategoryEditor
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onAdded={() => setTab('custom')}
        />
      )}
    </div>
  );
}

function CategoryEditor({
  category,
  onClose,
  onAdded,
}: {
  category: Category | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { addCategory, updateCategory, showToast } = useApp();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? ICONS[0]);
  const [color, setColor] = useState(category?.color ?? PALETTE[0]);

  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    if (category) {
      updateCategory(category.id, { name: name.trim(), icon, color });
      showToast('カテゴリを更新しました');
    } else {
      addCategory({ name: name.trim(), icon, color });
      showToast('カテゴリを追加しました');
      onAdded();
    }
    onClose();
  };

  return (
    <Sheet
      title={category ? 'カテゴリを編集' : 'カテゴリを追加'}
      onClose={onClose}
      rightAction={
        <button className="link" onClick={save} style={{ opacity: canSave ? 1 : 0.35 }}>
          保存
        </button>
      }
    >
      <div className="row" style={{ marginBottom: 16 }}>
        <span
          className="tile-solid"
          style={{ background: color, color: '#fff', width: 46, height: 46, fontSize: 22 }}
        >
          {icon}
        </span>
        <span className="bold" style={{ fontSize: 17 }}>
          {name || 'カテゴリ名'}
        </span>
      </div>

      <div className="field">
        <label className="field-label">名前</label>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例: ペット"
          autoFocus
        />
      </div>

      <div className="field">
        <label className="field-label">アイコン</label>
        <div className="chips">
          {ICONS.map((i) => (
            <button
              key={i}
              className={`chip ${icon === i ? 'on' : ''}`}
              style={{ fontSize: 17, padding: '6px 10px' }}
              onClick={() => setIcon(i)}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label">色</label>
        <div className="chips">
          {PALETTE.map((c) => (
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

      <button className="btn btn-primary btn-block mt-16" onClick={save} disabled={!canSave}>
        保存する
      </button>
    </Sheet>
  );
}
