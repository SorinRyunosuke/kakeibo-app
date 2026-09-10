import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '../store/AuthContext';
import { checkPasswordStrength } from '../lib/auth';

// ============================================================================
// ログインの関所。
// ログイン済みでなければアプリ本体を一切描画せず、作成/ログイン画面を出す。
// ============================================================================

export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  if (status === 'loading') {
    // 判定は一瞬。チラつき防止に空の器だけ
    return <div className="app" />;
  }

  if (status === 'needsSignup') return <SignupScreen />;
  if (status === 'needsLogin') return <LoginScreen />;

  return <>{children}</>;
}

// --- 共通の枠 ---------------------------------------------------------------

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="app">
      <div className="auth-screen">
        <div className="auth-logo" aria-hidden="true">
          ¥
        </div>
        <h1 className="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </div>
    </div>
  );
}

// --- アカウント作成 -------------------------------------------------------

function SignupScreen() {
  const { signup } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (username.trim().length === 0) {
      setError('お名前（表示名）を入力してください');
      return;
    }
    const strength = checkPasswordStrength(password);
    if (strength) {
      setError(strength);
      return;
    }
    if (password !== confirm) {
      setError('確認用のパスワードが一致しません');
      return;
    }

    setBusy(true);
    try {
      await signup(username, password);
    } catch {
      setError('アカウントを作成できませんでした。もう一度お試しください。');
      setBusy(false);
    }
  };

  return (
    <AuthShell title="アカウントを作成" subtitle="この端末だけで使う家計簿のログイン情報です">
      <form className="auth-form" onSubmit={submit}>
        <div className="field">
          <label className="field-label">お名前（表示名）</label>
          <input
            ref={nameRef}
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="例: 自分"
            autoComplete="username"
            maxLength={30}
          />
        </div>

        <div className="field">
          <label className="field-label">パスワード</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="4文字以上"
            autoComplete="new-password"
          />
        </div>

        <div className="field">
          <label className="field-label">パスワード（確認）</label>
          <input
            className="input"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="もう一度入力"
            autoComplete="new-password"
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? '作成中…' : 'アカウントを作成'}
        </button>

        <p className="auth-note">
          パスワードはこの端末内にのみ保存され、外部には一切送信されません。
          <br />
          <b>忘れると復旧できません。</b>バックアップを定期的に取ってください。
        </p>
      </form>
    </AuthShell>
  );
}

// --- ログイン -----------------------------------------------------------

function LoginScreen() {
  const { username, login } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    pwRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const ok = await login(password);
    if (!ok) {
      setError('パスワードが違います');
      setPassword('');
      setBusy(false);
      pwRef.current?.focus();
    }
  };

  const greeting = useMemo(
    () => (username ? `${username} さん、おかえりなさい` : 'おかえりなさい'),
    [username],
  );

  return (
    <AuthShell title="ログイン" subtitle={greeting}>
      <form className="auth-form" onSubmit={submit}>
        {/* スクリーンリーダー / パスワードマネージャ向けにユーザー名を持たせておく */}
        <input
          type="text"
          value={username ?? ''}
          autoComplete="username"
          readOnly
          hidden
        />
        <div className="field">
          <label className="field-label">パスワード</label>
          <input
            ref={pwRef}
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力"
            autoComplete="current-password"
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
          {busy ? '確認中…' : 'ログイン'}
        </button>

        <p className="auth-note">
          パスワードを忘れた場合、復旧はできません。
          <br />
          その場合はデータを削除して作り直すことになります。
        </p>
      </form>
    </AuthShell>
  );
}
