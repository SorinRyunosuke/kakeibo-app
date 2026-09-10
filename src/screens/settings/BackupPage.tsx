import { useRef, useState } from 'react';
import { useApp } from '../../store/AppContext';
import {
  backupFilename,
  buildBackup,
  buildCSV,
  downloadFile,
  parseBackup,
} from '../../storage/backup';
import { AppBar, Section } from '../../components/ui';
import { IconChevronRight, IconDownload, IconUpload } from '../../components/icons';

// ============================================================================
// バックアップ / 復元
//
// localStorage はブラウザのデータ削除・機種変更で消える。
// 「自分専用の最小構成」を保ちつつ、消えても復旧できる導線をここに集約する。
// ============================================================================

export function BackupPage({ onBack }: { onBack: () => void }) {
  const { data, replaceAll, resetAll, showToast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleImport = async (file: File) => {
    setImporting(true);
    try {
      const next = parseBackup(await file.text());
      const ok = confirm(
        `バックアップを読み込みます。\n\n支出 ${next.expenses.length}件 / カード ${next.creditCards.length}枚 / カテゴリ ${next.categories.length}件\n\n現在のデータはすべて置き換わります。よろしいですか？`,
      );
      if (!ok) return;
      replaceAll(next);
      showToast('バックアップから復元しました');
      onBack();
    } catch {
      alert('ファイルを読み込めませんでした。このアプリで書き出した JSON を選んでください。');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page">
      <AppBar title="バックアップ" onBack={onBack} />

      <div className="card">
        <div className="row-between small">
          <span className="muted">支出</span>
          <b>{data.expenses.length}件</b>
        </div>
        <div className="row-between small mt-8">
          <span className="muted">クレジットカード</span>
          <b>{data.creditCards.length}枚</b>
        </div>
        <div className="row-between small mt-8">
          <span className="muted">カテゴリ / 固定費</span>
          <b>
            {data.categories.length}件 / {data.fixedExpenses.length}件
          </b>
        </div>
      </div>

      <Section title="書き出す">
        <div className="list">
          <button
            className="list-row"
            onClick={() => {
              downloadFile(backupFilename('json'), buildBackup(data), 'application/json');
              showToast('JSONを書き出しました');
            }}
          >
            <span
              className="tile"
              style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
            >
              <IconDownload size={18} />
            </span>
            <span className="list-row-main">
              <span className="list-row-title">JSONで書き出す（完全バックアップ）</span>
              <span className="list-row-sub">設定・カード・固定費まで含む。復元にはこちら</span>
            </span>
            <IconChevronRight size={16} className="chevron" />
          </button>

          <button
            className="list-row"
            onClick={() => {
              downloadFile(backupFilename('csv'), buildCSV(data), 'text/csv');
              showToast('CSVを書き出しました');
            }}
          >
            <span className="tile" style={{ background: '#eef4fd', color: '#3f7fd8' }}>
              <IconDownload size={18} />
            </span>
            <span className="list-row-main">
              <span className="list-row-title">CSVで書き出す（支出のみ）</span>
              <span className="list-row-sub">Excel / スプレッドシートで開けます</span>
            </span>
            <IconChevronRight size={16} className="chevron" />
          </button>
        </div>
      </Section>

      <Section title="読み込む">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleImport(file);
          }}
        />
        <button className="list-row" onClick={() => fileRef.current?.click()} disabled={importing}>
          <span className="tile" style={{ background: '#fdf3e0', color: '#b8770c' }}>
            <IconUpload size={18} />
          </span>
          <span className="list-row-main">
            <span className="list-row-title">JSONから復元する</span>
            <span className="list-row-sub">現在のデータは置き換わります</span>
          </span>
          <IconChevronRight size={16} className="chevron" />
        </button>
      </Section>

      <div className="divider" style={{ marginTop: 22 }} />

      <button
        className="btn btn-danger btn-block"
        onClick={() => {
          if (!confirm('すべてのデータを削除します。元に戻せません。よろしいですか？')) return;
          if (!confirm('本当に削除しますか？先にJSONバックアップを取ることを強くおすすめします。'))
            return;
          resetAll();
          showToast('データを初期化しました');
          onBack();
        }}
      >
        すべてのデータを削除
      </button>

      <p className="hint" style={{ marginTop: 16 }}>
        データはこの端末のブラウザ内（localStorage）にのみ保存されています。
        ブラウザの履歴削除・シークレットモード・機種変更で消えるため、
        月に一度など定期的な JSON バックアップをおすすめします。
      </p>
    </div>
  );
}
