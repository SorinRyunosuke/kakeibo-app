import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { useAuth } from '../store/AuthContext';
import { getBudgetForMonth, totalFixedExpenses } from '../lib/budget';
import { checkPasswordStrength } from '../lib/auth';
import { toMonthKey } from '../lib/date';
import { yen } from '../lib/format';
import { useInstallPrompt } from '../lib/useInstallPrompt';
import { PageHead, Section, Sheet } from '../components/ui';
import {
  IconCard,
  IconChevronRight,
  IconDownload,
  IconHistory,
  IconInfo,
  IconLock,
  IconLogout,
  IconRepeat,
  IconTag,
  IconTarget,
  IconUser,
} from '../components/icons';

// ============================================================================
// 「その他」タブ。設定と、頻繁には開かない画面への入り口をまとめる。
// ============================================================================

export type MorePage = 'budget' | 'fixed' | 'cards' | 'categories' | 'history' | 'backup';

export function More({ onOpen }: { onOpen: (page: MorePage) => void }) {
  const { data } = useApp();
  const { username, logout } = useAuth();
  const [pwSheet, setPwSheet] = useState(false);
  const month = toMonthKey(new Date());

  const budget = useMemo(
    () => getBudgetForMonth(month, data.settings, data.budgets, data.fixedExpenses),
    [month, data.settings, data.budgets, data.fixedExpenses],
  );
  const fixedTotal = totalFixedExpenses(data.fixedExpenses);
  const activeCards = data.creditCards.filter((c) => !c.archived);

  const money: Row[] = [
    {
      key: 'budget',
      icon: <IconTarget size={19} />,
      color: 'var(--primary)',
      title: '予算設定',
      sub:
        data.settings.budgetMode === 'auto'
          ? `手取り ${yen(data.settings.income)} − 固定費 ${yen(fixedTotal)}`
          : '毎月の自由に使える金額を指定',
      value: yen(budget),
    },
    {
      key: 'fixed',
      icon: <IconRepeat size={19} />,
      color: '#5b9df9',
      title: '固定費',
      sub:
        data.fixedExpenses.length === 0
          ? '家賃・サブスクなどを登録'
          : `${data.fixedExpenses.filter((f) => f.active).length}件が有効`,
      value: yen(fixedTotal),
    },
    {
      key: 'cards',
      icon: <IconCard size={19} />,
      color: '#9b7bf0',
      title: 'クレジットカード',
      sub:
        activeCards.length === 0
          ? '締め日・支払日を登録すると請求予定が出ます'
          : activeCards.map((c) => c.name).join('・'),
      value: `${activeCards.length}枚`,
    },
  ];

  const others: Row[] = [
    {
      key: 'categories',
      icon: <IconTag size={19} />,
      color: '#ff8c42',
      title: 'カテゴリ管理',
      sub: '追加・編集・削除',
      value: `${data.categories.length}件`,
    },
    {
      key: 'history',
      icon: <IconHistory size={19} />,
      color: '#2bc4b4',
      title: '月別履歴',
      sub: '過去の月の使用額と前月比',
    },
    {
      key: 'backup',
      icon: <IconDownload size={19} />,
      color: '#8fa0b5',
      title: 'バックアップ',
      sub: 'JSON / CSV の書き出しと復元',
      value: `${data.expenses.length}件`,
    },
  ];

  return (
    <div className="page">
      <PageHead title="その他" />

      <InstallCard />

      <Section title="お金の設定">
        <div className="list">
          {money.map((r) => (
            <MoreRow key={r.key} row={r} onClick={() => onOpen(r.key)} />
          ))}
        </div>
      </Section>

      <Section title="データ">
        <div className="list">
          {others.map((r) => (
            <MoreRow key={r.key} row={r} onClick={() => onOpen(r.key)} />
          ))}
        </div>
      </Section>

      <Section title="アカウント">
        <div className="list">
          <div className="list-row">
            <span
              className="tile"
              style={{ background: 'color-mix(in srgb, #5b9df9 14%, #fff)', color: '#5b9df9' }}
            >
              <IconUser size={19} />
            </span>
            <span className="list-row-main">
              <span className="list-row-title">{username ?? '—'}</span>
              <span className="list-row-sub">ログイン中（この端末）</span>
            </span>
          </div>

          <button className="list-row" onClick={() => setPwSheet(true)}>
            <span
              className="tile"
              style={{ background: 'color-mix(in srgb, #8fa0b5 14%, #fff)', color: '#8fa0b5' }}
            >
              <IconLock size={19} />
            </span>
            <span className="list-row-main">
              <span className="list-row-title">パスワードを変更</span>
            </span>
            <IconChevronRight size={16} className="chevron" />
          </button>

          <button
            className="list-row"
            onClick={() => {
              if (confirm('ログアウトしますか？\n再度使うにはパスワードの入力が必要です。')) {
                logout();
              }
            }}
          >
            <span
              className="tile"
              style={{ background: 'color-mix(in srgb, var(--danger) 14%, #fff)', color: 'var(--danger)' }}
            >
              <IconLogout size={19} />
            </span>
            <span className="list-row-main">
              <span className="list-row-title" style={{ color: 'var(--danger)' }}>
                ログアウト
              </span>
            </span>
          </button>
        </div>
      </Section>

      <p className="hint" style={{ marginTop: 22, textAlign: 'center' }}>
        データはこの端末のブラウザ内にのみ保存されます。
        <br />
        機種変更やブラウザデータ削除に備えて、
        <br />
        定期的にバックアップを取ってください。
      </p>

      {pwSheet && <PasswordSheet onClose={() => setPwSheet(false)} />}
    </div>
  );
}

/** パスワード変更シート */
function PasswordSheet({ onClose }: { onClose: () => void }) {
  const { changePassword } = useAuth();
  const { showToast } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(null);
    const strength = checkPasswordStrength(next);
    if (strength) {
      setError(strength);
      return;
    }
    if (next !== confirmPw) {
      setError('確認用のパスワードが一致しません');
      return;
    }
    setBusy(true);
    const result = await changePassword(current, next);
    if (result === 'wrong') {
      setError('現在のパスワードが違います');
      setBusy(false);
      return;
    }
    showToast('パスワードを変更しました');
    onClose();
  };

  return (
    <Sheet
      title="パスワードを変更"
      onClose={onClose}
      rightAction={
        <button className="link" onClick={submit}>
          変更
        </button>
      }
    >
      <div className="field">
        <label className="field-label">現在のパスワード</label>
        <input
          className="input"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <div className="field">
        <label className="field-label">新しいパスワード</label>
        <input
          className="input"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="4文字以上"
          autoComplete="new-password"
        />
      </div>
      <div className="field">
        <label className="field-label">新しいパスワード（確認）</label>
        <input
          className="input"
          type="password"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <button className="btn btn-primary btn-block mt-8" onClick={submit} disabled={busy}>
        {busy ? '変更中…' : 'パスワードを変更'}
      </button>
    </Sheet>
  );
}

/**
 * ホーム画面へのインストールを促すカード。
 * Chrome のメニューを探さなくても、ここから直接インストールできるようにする。
 * インストール済み・条件を満たしていないときは、その理由を出す。
 */
function InstallCard() {
  const { showToast } = useApp();
  const { state, install } = useInstallPrompt();
  // localhost も安全なコンテキストなので、protocol ではなくこちらで判定する
  const secure = typeof window !== 'undefined' && window.isSecureContext;

  if (state === 'installed') return null;

  if (state === 'ready') {
    return (
      <div className="card" style={{ marginBottom: 4 }}>
        <div className="row">
          <span
            className="tile"
            style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
          >
            <IconDownload size={19} />
          </span>
          <div className="grow">
            <p className="bold" style={{ fontSize: 14 }}>
              ホーム画面に追加
            </p>
            <p className="tiny faint">全画面で開き、圏外でも起動できるようになります</p>
          </div>
        </div>
        <button
          className="btn btn-primary btn-block btn-sm mt-12"
          onClick={async () => {
            const outcome = await install();
            if (outcome === 'accepted') showToast('インストールしました');
          }}
        >
          このアプリをインストール
        </button>
      </div>
    );
  }

  // インストールできない状態。原因を伝える（いちばん多いのは http で開いている場合）
  return (
    <div className="note" style={{ marginBottom: 4 }}>
      <IconInfo size={15} />
      <span>
        {secure
          ? 'この端末ではインストールボタンを表示できません。Chrome の ⋮ メニューから「アプリをインストール」または「ホーム画面に追加」を選んでください。すでにインストール済みの場合も表示されません。'
          : 'インストールするには https:// のURLで開く必要があります。いまは http で開いているため、ホーム画面に追加してもオフラインでは起動しません。'}
      </span>
    </div>
  );
}

interface Row {
  key: MorePage;
  icon: React.ReactNode;
  color: string;
  title: string;
  sub: string;
  value?: string;
}

function MoreRow({ row, onClick }: { row: Row; onClick: () => void }) {
  return (
    <button className="list-row" onClick={onClick}>
      <span
        className="tile"
        style={{ background: `color-mix(in srgb, ${row.color} 14%, #fff)`, color: row.color }}
      >
        {row.icon}
      </span>
      <span className="list-row-main">
        <span className="list-row-title">{row.title}</span>
        <span className="list-row-sub">{row.sub}</span>
      </span>
      {row.value && <span className="small bold">{row.value}</span>}
      <IconChevronRight size={16} className="chevron" />
    </button>
  );
}
