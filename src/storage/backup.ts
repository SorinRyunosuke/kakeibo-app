import type { AppData, Expense } from '../types';
import { migrate } from './schema';

// ============================================================================
// バックアップ / 移行
// localStorage だけに依存するとデータ消失リスクがあるため、
// JSON (完全バックアップ) と CSV (表計算ソフトで開ける形式) の両方を出せる。
// ============================================================================

export interface BackupEnvelope {
  app: 'kakeibo';
  exportedAt: string;
  data: AppData;
}

export function buildBackup(data: AppData): string {
  const envelope: BackupEnvelope = {
    app: 'kakeibo',
    exportedAt: new Date().toISOString(),
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

/** JSON バックアップを読み込む。envelope 形式でも生 AppData でも受け付ける */
export function parseBackup(text: string): AppData {
  const parsed = JSON.parse(text) as unknown;
  if (parsed && typeof parsed === 'object' && 'data' in parsed) {
    return migrate((parsed as BackupEnvelope).data);
  }
  return migrate(parsed);
}

function csvCell(value: string | number | undefined): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const CSV_HEADER = [
  'id',
  'date',
  'amount',
  'category',
  'paymentMethod',
  'creditCard',
  'merchant',
  'memo',
  'createdAt',
];

export function buildCSV(data: AppData): string {
  const catName = new Map(data.categories.map((c) => [c.id, c.name]));
  const cardName = new Map(data.creditCards.map((c) => [c.id, c.name]));

  const rows = [...data.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e: Expense) =>
      [
        e.id,
        e.date,
        e.amount,
        catName.get(e.categoryId) ?? e.categoryId,
        e.paymentMethod,
        e.creditCardId ? (cardName.get(e.creditCardId) ?? e.creditCardId) : '',
        e.merchant,
        e.memo,
        e.createdAt,
      ]
        .map(csvCell)
        .join(','),
    );

  // Excel が UTF-8 と判定できるよう BOM を付ける
  return '\uFEFF' + [CSV_HEADER.join(','), ...rows].join('\r\n');
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // revoke が早すぎると一部ブラウザで DL が中断されるため次フレームで解放
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupFilename(ext: 'json' | 'csv'): string {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `kakeibo-backup-${stamp}.${ext}`;
}
