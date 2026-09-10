// ============================================================================
// ログイン（この端末内で完結）
//
// - サーバーは無し。パスワードのハッシュだけを localStorage に持つ。
// - ハッシュ化は Web Crypto の PBKDF2（SHA-256, 反復あり）。ライブラリ不要。
// - 平文パスワードはどこにも保存しない。
// - ログイン状態は sessionStorage。タブ / PWA を閉じたら再ログインが必要。
// - パスワードを忘れたら復旧手段は無い（全消しして作り直すしかない）。
//
// 家計簿データそのものは暗号化していない（バックアップ機能・容量・
// 「忘れたら全ロスト」を避けるため）。ログインゲートで覗き見を防ぐ位置づけ。
// ============================================================================

const AUTH_KEY = 'kakeibo:auth';
const SESSION_KEY = 'kakeibo:auth:unlocked';
const ITERATIONS = 150_000;

export interface StoredAuth {
  v: 1;
  username: string;
  /** base64 */
  salt: string;
  /** base64。PBKDF2(password, salt) */
  hash: string;
  iterations: number;
  createdAt: string;
}

// --- base64 <-> bytes ---------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// --- ハッシュ（純粋・テスト対象） -------------------------------------------

/** PBKDF2 でパスワードから 256bit のハッシュを作り base64 で返す */
export async function hashPassword(
  password: string,
  salt: Uint8Array,
  iterations: number = ITERATIONS,
): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bytesToBase64(new Uint8Array(bits));
}

/** 保存済みレコードと突き合わせてパスワードが正しいか */
export async function verifyPassword(password: string, stored: StoredAuth): Promise<boolean> {
  const salt = base64ToBytes(stored.salt);
  const hash = await hashPassword(password, salt, stored.iterations);
  // 長さが違えば即 false。タイミング差はローカル用途では気にしない
  if (hash.length !== stored.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ stored.hash.charCodeAt(i);
  return diff === 0;
}

/** 新しい認証レコードを作る（salt をランダム生成してハッシュ） */
export async function createAuthRecord(username: string, password: string): Promise<StoredAuth> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await hashPassword(password, salt, ITERATIONS);
  return {
    v: 1,
    username: username.trim(),
    salt: bytesToBase64(salt),
    hash,
    iterations: ITERATIONS,
    createdAt: new Date().toISOString(),
  };
}

// --- localStorage / sessionStorage 操作 ------------------------------------

/** アカウントが作成済みか */
export function hasAccount(): boolean {
  try {
    return localStorage.getItem(AUTH_KEY) != null;
  } catch {
    return false;
  }
}

export function loadAuth(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredAuth;
    if (parsed && parsed.v === 1 && parsed.hash && parsed.salt) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveAuth(auth: StoredAuth): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

/** アカウントを削除（データ本体には触らない） */
export function clearAuth(): void {
  try {
    localStorage.removeItem(AUTH_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** このセッションでログイン済みか */
export function isUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function setUnlocked(v: boolean): void {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, '1');
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

// --- パスワードの強さチェック（ゆるめ） -----------------------------------

/** 問題があればエラーメッセージ、無ければ null */
export function checkPasswordStrength(password: string): string | null {
  if (password.length < 4) return 'パスワードは4文字以上にしてください';
  if (password.length > 200) return 'パスワードが長すぎます';
  return null;
}
