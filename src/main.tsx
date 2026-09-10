import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/** ネイティブアプリ（Capacitor）の中で動いているか */
function isNativeApp(): boolean {
  return (
    // Capacitor が注入するグローバル
    (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() ===
      true || /\bcapacitor:\/\//.test(document.referrer)
  );
}

// Service Worker を登録する。
// Android のホーム画面インストールと、オフラインでの起動に必要。
//
// 登録しない場合:
//   - 開発中（HMR と噛み合わず、古いファイルを掴む事故が起きる）
//   - ネイティブアプリ（ファイルは APK に入っているので不要。
//     むしろ古いキャッシュが残ってアプリ更新が反映されなくなる）
if (import.meta.env.PROD && 'serviceWorker' in navigator && !isNativeApp()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((err) => {
      console.warn('Service Worker を登録できませんでした', err);
    });
  });
}
