import type { CapacitorConfig } from '@capacitor/cli';

// ============================================================================
// ネイティブアプリ（APK）の設定。
//
// webDir の中身がそのまま APK に埋め込まれるので、
// サーバーもURLも不要で、初回起動から完全にオフラインで動く。
// ============================================================================

const config: CapacitorConfig = {
  appId: 'jp.kakeibo.app',
  appName: 'Kakeibo',
  webDir: 'dist',
  android: {
    // 画面下の余白を白にする（アプリの背景色に合わせる）
    backgroundColor: '#ffffff',
  },
  server: {
    // WebView 内での表示スキーム。localStorage の保存先がここで決まるため、
    // 一度決めたら変更しないこと（変えると過去の記録が読めなくなる）
    androidScheme: 'https',
  },
};

export default config;
