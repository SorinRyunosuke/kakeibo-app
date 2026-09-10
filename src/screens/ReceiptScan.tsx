import { useEffect, useRef, useState } from 'react';
import {
  parseReceipt,
  preprocessImage,
  recognizeReceipt,
  type OcrPhase,
  type ReceiptResult,
} from '../lib/receipt';
import { formatShortDate } from '../lib/date';
import { yen } from '../lib/format';
import { Sheet } from '../components/ui';
import { IconCheck, IconInfo } from '../components/icons';

// ============================================================================
// レシート読み取り
//
// 撮影 -> 端末内で OCR -> 候補を提示 -> タップで確定。
// 自動では入れない。読み違えたときに人が直せることを優先する。
// 画像は読み取り後に破棄する（保存しない）。
// ============================================================================

export interface ReceiptPick {
  amount?: number;
  date?: string;
  merchant?: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; phase: OcrPhase; progress: number }
  | { kind: 'done'; result: ReceiptResult }
  | { kind: 'error'; message: string };

export function ReceiptScan({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (pick: ReceiptPick) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);

  // 選択中の候補
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState<string | undefined>();
  const [merchant, setMerchant] = useState<string | undefined>();

  // 開いたらすぐカメラ／ファイル選択を出す
  useEffect(() => {
    const t = setTimeout(() => fileRef.current?.click(), 120);
    return () => clearTimeout(t);
  }, []);

  const run = async (file: File) => {
    setStatus({ kind: 'working', phase: 'loading', progress: 0 });
    try {
      const { blob, dataUrl } = await preprocessImage(file);
      setPreview(dataUrl);

      const text = await recognizeReceipt(blob, (phase, progress) =>
        setStatus({ kind: 'working', phase, progress }),
      );

      const result = parseReceipt(text);
      setAmount(result.amountCandidates[0]?.amount ?? null);
      setDate(result.date);
      setMerchant(result.merchantCandidates[0]);
      setStatus({ kind: 'done', result });
    } catch (err) {
      console.error(err);
      setStatus({
        kind: 'error',
        message:
          err instanceof Error && err.message.includes('fetch')
            ? '日本語の学習データを取得できませんでした。通信環境を確認してもう一度お試しください（初回のみ通信が必要です）。'
            : '画像を読み取れませんでした。もう一度撮影してみてください。',
      });
    }
  };

  const apply = () => {
    onApply({ amount: amount ?? undefined, date, merchant });
    onClose();
  };

  return (
    <Sheet
      title="レシートを読み取る"
      onClose={onClose}
      rightAction={
        status.kind === 'done' ? (
          <button className="link" onClick={apply} style={{ opacity: amount ? 1 : 0.35 }}>
            反映
          </button>
        ) : undefined
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void run(file);
          e.target.value = '';
        }}
      />

      {preview && (
        <img
          src={preview}
          alt="撮影したレシート"
          style={{
            width: '100%',
            maxHeight: 180,
            objectFit: 'contain',
            borderRadius: 'var(--radius)',
            background: 'var(--surface-2)',
            marginBottom: 14,
          }}
        />
      )}

      {status.kind === 'idle' && (
        <div className="empty">
          <span className="empty-icon">🧾</span>
          レシートを撮影してください。
          <br />
          平らに置いて、全体が入るように撮ると読み取りやすくなります。
        </div>
      )}

      {status.kind === 'working' && (
        <div style={{ padding: '10px 0 18px' }}>
          <p className="small muted" style={{ marginBottom: 8 }}>
            {status.phase === 'loading'
              ? '読み取りの準備をしています…（初回のみ少し時間がかかります）'
              : '文字を読み取っています…'}
          </p>
          <div className="bar">
            <div
              className="bar-fill"
              style={{ width: `${Math.round(status.progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {status.kind === 'error' && (
        <>
          <div
            className="alert"
            style={{ ['--alert-bg' as string]: '#fdeceb', ['--alert-fg' as string]: '#c8352e' }}
          >
            <span>⚠️</span>
            <span>{status.message}</span>
          </div>
          <button
            className="btn btn-outline btn-block mt-16"
            onClick={() => fileRef.current?.click()}
          >
            もう一度撮影する
          </button>
        </>
      )}

      {status.kind === 'done' && (
        <>
          {status.result.amountCandidates.length === 0 ? (
            <div
              className="alert"
              style={{ ['--alert-bg' as string]: '#fdf3e0', ['--alert-fg' as string]: '#a86a08' }}
            >
              <span>⚠️</span>
              <span>金額を読み取れませんでした。撮り直すか、手で入力してください。</span>
            </div>
          ) : (
            <div className="field">
              <label className="field-label">金額の候補（タップで選択）</label>
              <div className="chips">
                {status.result.amountCandidates.map((c) => (
                  <button
                    key={c.amount}
                    className={`chip ${amount === c.amount ? 'on' : ''}`}
                    style={{ fontSize: 15, padding: '10px 15px' }}
                    onClick={() => setAmount(c.amount)}
                  >
                    {yen(c.amount)}
                    {c.confident && <span className="badge badge-ok">合計</span>}
                  </button>
                ))}
              </div>
              {status.result.amountCandidates[0]?.confident === false && (
                <p className="hint">
                  「合計」の行を見つけられなかったため、読み取れた金額を大きい順に並べています。
                </p>
              )}
            </div>
          )}

          <div className="field">
            <label className="field-label">日付</label>
            {date ? (
              <div className="chips">
                <button className="chip on" onClick={() => setDate(undefined)}>
                  <IconCheck size={14} /> {formatShortDate(date)}
                </button>
                <span className="hint" style={{ alignSelf: 'center', marginTop: 0 }}>
                  タップで解除（今日の日付になります）
                </span>
              </div>
            ) : (
              <p className="hint" style={{ marginTop: 0 }}>
                読み取れませんでした。今日の日付を使います。
              </p>
            )}
          </div>

          {status.result.merchantCandidates.length > 0 && (
            <div className="field">
              <label className="field-label">店名の候補</label>
              <div className="chips">
                {status.result.merchantCandidates.map((m) => (
                  <button
                    key={m}
                    className={`chip ${merchant === m ? 'on' : ''}`}
                    onClick={() => setMerchant(merchant === m ? undefined : m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="note">
            <IconInfo size={15} />
            <span>
              読み取りは目安です。反映後に登録画面で必ず確認してください。カテゴリは自分で選ぶ必要があります。
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              className="btn btn-outline btn-sm"
              style={{ flex: '0 0 auto' }}
              onClick={() => fileRef.current?.click()}
            >
              撮り直す
            </button>
            <button className="btn btn-primary grow" onClick={apply} disabled={!amount}>
              この内容で入力する
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}
