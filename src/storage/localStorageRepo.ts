import type { AppData } from '../types';
import type { Repository } from './repository';
import { createEmptyData, migrate } from './schema';

const STORAGE_KEY = 'kakeibo:v1';
/** 保存失敗時の巻き戻し用に、直前の状態を 1 世代だけ残す */
const BACKUP_KEY = 'kakeibo:v1:backup';

export class LocalStorageRepository implements Repository {
  async load(): Promise<AppData> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyData();
      return migrate(JSON.parse(raw));
    } catch (err) {
      console.error('データの読み込みに失敗しました。バックアップを試します。', err);
      try {
        const backup = localStorage.getItem(BACKUP_KEY);
        if (backup) return migrate(JSON.parse(backup));
      } catch {
        /* バックアップも壊れていれば空データで起動する */
      }
      return createEmptyData();
    }
  }

  async save(data: AppData): Promise<void> {
    const serialized = JSON.stringify(data);
    const previous = localStorage.getItem(STORAGE_KEY);
    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      if (previous) localStorage.setItem(BACKUP_KEY, previous);
    } catch (err) {
      // 容量超過など。バックアップを削って再試行する
      console.error('保存に失敗しました', err);
      try {
        localStorage.removeItem(BACKUP_KEY);
        localStorage.setItem(STORAGE_KEY, serialized);
      } catch {
        throw new Error('保存に失敗しました。ブラウザの空き容量を確認してください。');
      }
    }
  }

  async exportRaw(): Promise<string> {
    return localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(createEmptyData());
  }

  async clear(): Promise<void> {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(BACKUP_KEY);
  }
}
