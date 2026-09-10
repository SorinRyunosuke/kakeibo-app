import { useCallback, useEffect, useState } from 'react';

// ============================================================================
// ホーム画面へのインストール
//
// Chrome はインストール可能になると beforeinstallprompt を投げてくる。
// 既定のバナーは出さずにイベントを取っておき、アプリ内のボタンから
// 好きなタイミングでインストールダイアログを出す。
//
// イベントは React が動き出す前に飛んでくることがあるため、
// index.html の先頭で window.__installPrompt に捕まえておき、ここで拾う。
// ============================================================================

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    __installPrompt?: BeforeInstallPromptEvent | null;
  }
}

/** ホーム画面から起動している（= インストール済み）か */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari 独自
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export type InstallState =
  /** インストールできる（ボタンを出してよい） */
  | 'ready'
  /** すでにインストール済み、またはホーム画面から起動中 */
  | 'installed'
  /** まだ条件を満たしていない（http で開いている、SW 未登録など） */
  | 'unavailable';

export function useInstallPrompt(): {
  state: InstallState;
  install: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
} {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(
    typeof window === 'undefined' ? null : (window.__installPrompt ?? null),
  );
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const onAvailable = () => setPrompt(window.__installPrompt ?? null);
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      window.__installPrompt = null;
    };

    // index.html の先読みスクリプトが取りこぼした場合に備えて直接も購読する
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      window.__installPrompt = e as BeforeInstallPromptEvent;
      setPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('kakeibo:installable', onAvailable);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('kakeibo:installable', onAvailable);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return 'unavailable' as const;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    // 同じイベントは一度しか使えない
    window.__installPrompt = null;
    setPrompt(null);
    if (outcome === 'accepted') setInstalled(true);
    return outcome;
  }, [prompt]);

  const state: InstallState = installed ? 'installed' : prompt ? 'ready' : 'unavailable';

  return { state, install };
}
