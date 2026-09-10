import type { AppData } from '../types';

/**
 * 保存層のインターフェース。
 * 現在は localStorage 実装のみだが、将来 Supabase / SQLite / IndexedDB に
 * 差し替えられるよう、UI 側はこの型にしか依存しない。
 */
export interface Repository {
  load(): Promise<AppData>;
  save(data: AppData): Promise<void>;
  /** バックアップ用の生 JSON */
  exportRaw(): Promise<string>;
  clear(): Promise<void>;
}
