// ============================================================================
// レシートOCRを完全オフラインで動かすために、必要なファイルを public/ に置く。
//
//   node scripts/bundle-ocr.mjs
//
// 既定では tesseract.js は実行ファイル(wasm)と日本語の学習データを CDN から
// 取りに行く。ネイティブアプリ（APK）や圏外での利用では通信できないため、
// あらかじめアプリ内に同梱しておく。
//
// 学習データは「fast」版を使う。通常版 15MB に対して 1.5MB と小さく、
// レシートの「合計」を見つけて数字を読む用途なら実用になるため。
// ============================================================================

import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'tesseract');
const LANG_DIR = join(OUT, 'lang');

/**
 * tesseract.js が読み込む可能性のある実行ファイル一式。
 *
 * 1つのビルドにつき3ファイル必要:
 *   .js       … 単体版のエントリ
 *   .wasm     … 本体
 *   .wasm.js  … wasm を読み込むためのグルーコード（worker が importScripts する）
 * どれか1つでも欠けると読み込みに失敗するので、変種ごとに3つとも入れる。
 *
 * 端末の SIMD 対応状況によって tesseract.js がどれを使うか決めるため、
 * 3変種すべてを同梱しておく。
 */
const CORE_VARIANTS = [
  // SIMD 対応端末向け（最近の Android はこれ）
  'tesseract-core-simd-lstm',
  // relaxed SIMD 対応向け
  'tesseract-core-relaxedsimd-lstm',
  // 非対応端末向けのフォールバック
  'tesseract-core-lstm',
];

const CORE_FILES = CORE_VARIANTS.flatMap((v) => [`${v}.js`, `${v}.wasm`, `${v}.wasm.js`]);

const LANG = 'jpn';
const LANG_URL = `https://tessdata.projectnaptha.com/4.0.0_fast/${LANG}.traineddata.gz`;

mkdirSync(OUT, { recursive: true });
mkdirSync(LANG_DIR, { recursive: true });

// --- 実行ファイルと worker を node_modules からコピー ------------------------

const coreDir = join(ROOT, 'node_modules', 'tesseract.js-core');
const workerSrc = join(ROOT, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');

if (!existsSync(coreDir) || !existsSync(workerSrc)) {
  console.error('tesseract.js が見つかりません。先に `npm install` を実行してください。');
  process.exit(1);
}

let copied = 0;
for (const name of CORE_FILES) {
  const src = join(coreDir, name);
  if (!existsSync(src)) {
    console.warn(`  skip (見つかりません): ${name}`);
    continue;
  }
  copyFileSync(src, join(OUT, name));
  copied++;
}
copyFileSync(workerSrc, join(OUT, 'worker.min.js'));
console.log(`実行ファイルをコピーしました: ${copied + 1} 件`);

// --- 学習データをダウンロードして展開 ---------------------------------------

const langOut = join(LANG_DIR, `${LANG}.traineddata`);

if (existsSync(langOut)) {
  console.log(`学習データは取得済みです (${(statSync(langOut).size / 1024 / 1024).toFixed(1)} MB)`);
} else {
  console.log(`学習データを取得しています... ${LANG_URL}`);
  try {
    const res = await fetch(LANG_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const gz = Buffer.from(await res.arrayBuffer());
    // 配信側の Content-Encoding によって二重展開の事故が起きるため、
    // gz のままではなく展開した状態で置き、実行時は gzip:false で読む
    const raw = gunzipSync(gz);
    await writeFile(langOut, raw);
    console.log(`学習データを保存しました (${(raw.length / 1024 / 1024).toFixed(1)} MB)`);
  } catch (err) {
    console.warn('');
    console.warn('学習データを取得できませんでした:', err.message);
    console.warn('アプリは動きますが、レシート読み取りの初回だけ通信が必要になります。');
    console.warn('（通信できる環境で `npm run ocr:bundle` を実行すると同梱されます）');
  }
}

// --- 同梱できたかを示す目印を書き出す ---------------------------------------
// 実行時にこのファイルの有無で、ローカル版と CDN 版を切り替える

const hasLang = existsSync(langOut);
await writeFile(
  join(OUT, 'manifest.json'),
  JSON.stringify({ lang: hasLang ? LANG : null, generatedAt: new Date().toISOString() }, null, 2),
);

console.log('');
console.log(`出力先: ${OUT}`);
console.log(hasLang ? '完全オフラインでOCRが動きます。' : '学習データ未同梱（初回のみ通信が必要）。');

