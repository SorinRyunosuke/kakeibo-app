import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // 相対パスで出力する。ルート直下でも GitHub Pages のサブディレクトリでも
  // そのまま動くようにするため（Android にインストールして使う前提）
  base: './',
  server: {
    // `npm run dev:lan` でスマホから見られるようにする
    host: true,
  },
  preview: {
    host: true,
  },
});
