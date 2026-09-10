/* ============================================================================
   Service Worker
   - Android のホーム画面インストールに必要
   - 圏外・機内モードでもアプリが開けるようにする
   - レシートOCRの学習データもキャッシュして2回目以降を通信なしにする

   キャッシュ戦略:
     ページ遷移        : ネットワーク優先（更新をすぐ反映）→ 失敗したらキャッシュ
     自サイトの静的ファイル: キャッシュ優先（ファイル名にハッシュが付くので安全）
     OCRのCDN          : キャッシュ優先（一度落とせば以後オフラインで動く）
   ============================================================================ */

const VERSION = 'v4';
const SHELL_CACHE = `kakeibo-shell-${VERSION}`;
const ASSET_CACHE = `kakeibo-assets-${VERSION}`;
const OCR_CACHE = `kakeibo-ocr-${VERSION}`;

/** OCR の実行ファイル・学習データの配布元 */
const OCR_HOSTS = ['cdn.jsdelivr.net', 'tessdata.projectnaptha.com', 'unpkg.com'];

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './favicon.svg',
];

/**
 * 初回インストール時に、オフラインでも起動できるだけのファイルを揃える。
 *
 * JS/CSS のファイル名はビルドごとにハッシュが変わるため、ここでは
 * index.html を取得して中の <script src> / <link href> を読み取り、
 * 実際のバンドル名を拾ってキャッシュする。
 * （Service Worker が動き出す頃にはページ側の読み込みが終わっていて、
 *   fetch ハンドラでは拾えないため、install で明示的に取りに行く）
 */
async function precache() {
  const shell = await caches.open(SHELL_CACHE);
  // 1つでも失敗すると install ごと失敗するので、個別に握りつぶす
  await Promise.all(SHELL.map((url) => shell.add(url).catch(() => {})));

  try {
    const res = await fetch('./index.html', { cache: 'reload' });
    if (!res.ok) return;
    await shell.put('./index.html', res.clone());

    const html = await res.text();
    const urls = new Set();
    for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+\.(?:js|css))["']/g)) {
      urls.add(new URL(m[1], self.registration.scope).href);
    }

    const assets = await caches.open(ASSET_CACHE);
    await Promise.all([...urls].map((u) => assets.add(u).catch(() => {})));
  } catch {
    // オフラインでインストールされた場合など。次回の fetch で拾えるので握りつぶす
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  const keep = new Set([SHELL_CACHE, ASSET_CACHE, OCR_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => !keep.has(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

/**
 * キャッシュ照合のオプション。
 *
 * ignoreVary が要る理由: 配信サーバーが `Vary: Origin` を返すことがあり、
 * その場合 <script crossorigin> からの実リクエスト（Origin ヘッダ付き）が
 * キャッシュに一致せず、オフラインで起動できなくなる。
 * 同じ URL なら同じ中身とみなしてよいので Vary は無視する。
 */
const MATCH = { ignoreVary: true };

/**
 * ページ遷移以外のリクエストに HTML が返ってきたら、それは
 * 「ファイルが無いので index.html を返した」= SPA フォールバックとみなす。
 *
 * これをキャッシュしてしまうと、あとでファイルを追加しても
 * 古い HTML を返し続けてしまい（cache-first のため）、
 * 「MIME type ('text/html') is not executable」で永久に壊れる。
 */
function isSpaFallback(request, response) {
  if (request.mode === 'navigate' || request.destination === 'document') return false;
  return (response.headers.get('content-type') || '').includes('text/html');
}

/** キャッシュ優先。無ければ取りに行き、取れたら入れておく */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;

  try {
    const response = await fetch(request);
    // opaque(status 0) はサイズ不明で容量を食うので入れない
    // 中身が SPA フォールバックの HTML なら、間違いなのでキャッシュしない
    if (response && response.status === 200 && !isSpaFallback(request, response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // オフラインで取りに行けなかった。念のため URL だけで探し直す
    const fallback = await caches.match(request.url, MATCH);
    if (fallback) return fallback;
    throw err;
  }
}

/** ネットワーク優先。オフラインならキャッシュにフォールバック */
async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const hit =
      (await cache.match(request, MATCH)) ||
      (fallbackUrl && (await cache.match(fallbackUrl, MATCH)));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 画面遷移（アプリを開く操作）
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL_CACHE, './index.html'));
    return;
  }

  // OCR の実行ファイル・学習データ
  if (OCR_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, OCR_CACHE));
    return;
  }

  // 自サイトの静的ファイル
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});

// 「更新して再読み込み」をアプリ側から指示できるようにしておく
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});
