import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  clearAuth,
  createAuthRecord,
  hasAccount,
  isUnlocked,
  loadAuth,
  saveAuth,
  setUnlocked,
  verifyPassword,
} from '../lib/auth';

// ============================================================================
// ログイン状態。
//   loading    : 判定中（一瞬）
//   needsSignup: アカウント未作成 → 作成画面
//   needsLogin : 作成済みだが未ログイン → ログイン画面
//   authed     : ログイン済み → アプリ本体
// ============================================================================

type Status = 'loading' | 'needsSignup' | 'needsLogin' | 'authed';

interface AuthContextValue {
  status: Status;
  username: string | null;
  /** 初回のアカウント作成 */
  signup: (username: string, password: string) => Promise<void>;
  /** パスワード照合。誤りなら false（例外は投げない） */
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  /** 旧パスワード照合のうえ変更。誤りなら 'wrong'、成功なら null */
  changePassword: (current: string, next: string) => Promise<'wrong' | null>;
  /** アカウントごと削除（呼び出し側でデータ削除の要否を判断） */
  removeAccount: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const account = loadAuth();
    if (!account) {
      setStatus('needsSignup');
      return;
    }
    setUsername(account.username);
    setStatus(isUnlocked() ? 'authed' : 'needsLogin');
  }, []);

  const signup = useCallback(async (name: string, password: string) => {
    const record = await createAuthRecord(name, password);
    saveAuth(record);
    setUnlocked(true);
    setUsername(record.username);
    setStatus('authed');
  }, []);

  const login = useCallback(async (password: string) => {
    const account = loadAuth();
    if (!account) return false;
    const ok = await verifyPassword(password, account);
    if (ok) {
      setUnlocked(true);
      setStatus('authed');
    }
    return ok;
  }, []);

  const logout = useCallback(() => {
    setUnlocked(false);
    setStatus(hasAccount() ? 'needsLogin' : 'needsSignup');
  }, []);

  const changePassword = useCallback(async (current: string, next: string) => {
    const account = loadAuth();
    if (!account) return 'wrong' as const;
    const ok = await verifyPassword(current, account);
    if (!ok) return 'wrong' as const;
    const record = await createAuthRecord(account.username, next);
    saveAuth(record);
    return null;
  }, []);

  const removeAccount = useCallback(() => {
    clearAuth();
    setUsername(null);
    setStatus('needsSignup');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, username, signup, login, logout, changePassword, removeAccount }),
    [status, username, signup, login, logout, changePassword, removeAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
