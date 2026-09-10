// ============================================================================
// レシートOCR
//
// 方針: 「撮ったら勝手に入る」ではなく「候補を出して人が確定する」。
// 日本のレシートは感熱紙・しわ・退色で読み違えが普通に起きるため、
// 自動確定はせず、必ず候補提示 -> タップ -> 通常の登録画面を経由させる。
//
// OCR そのもの（recognizeReceipt）は端末内で完結する。
// 解析部分（parseReceipt）は純粋関数にして単体テストできるようにしてある。
// ============================================================================

export interface AmountCandidate {
  amount: number;
  /** どの行から拾ったか（「合計」など）。UI で根拠として見せる */
  source: string;
  /** 合計を表す語の行から拾えたか。true なら第一候補にする */
  confident: boolean;
}

export interface ReceiptResult {
  amountCandidates: AmountCandidate[];
  date?: string;
  merchantCandidates: string[];
  rawText: string;
}

// --- 正規化 ---------------------------------------------------------------

/** 全角英数・記号を半角に寄せ、OCR が混同しがちな文字をならす */
export function normalizeText(text: string): string {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[，、]/g, ',')
    .replace(/[．]/g, '.')
    .replace(/[－ー―‐]/g, '-')
    .replace(/[￥＼\\]/g, '¥')
    .replace(/[／]/g, '/')
    .replace(/[ \t　]+/g, ' ');
}

// --- 金額 -----------------------------------------------------------------

/**
 * 日本語 OCR は文字の間に空白を入れてくることが多い（「合 計」「ポ イ ン ト」）。
 * キーワード照合の前に空白を落として、素直な正規表現で判定できるようにする。
 */
const compact = (s: string) => s.replace(/\s+/g, '');

/** 合計を表す語 */
const TOTAL_RE = /(合計|総額|お?買上げ?計|税込計|ご?請求額?|お会計)/;

/** 購入金額ではない行。ここに当たった行は候補から外す */
const EXCLUDE_RE = new RegExp(
  [
    '小計',
    'お?預(り|かり)',
    '預り金',
    'お?釣り?',
    '釣銭',
    'おつり',
    'ポイント',
    'point',
    'pt',
    '残高',
    '値引',
    '割引',
    '消費税',
    '内税',
    '外税',
    '対象',
    '現金',
    '税率',
    '枚数',
    '点数',
    // レジ番号・伝票番号など、金額ではない番号が並ぶ行
    'レジ',
    '責',
    '伝票',
    '取引',
    '店番',
    '端末',
    '会員',
    'カード番号',
    '登録番号',
  ].join('|'),
  'i',
);

/**
 * OCR が日本語の文字間に入れた空白を詰める。
 * 「セブ ン イ レブ ン 渋 谷 店」→「セブンイレブン渋谷店」
 * 半角英数の間の空白は単語の区切りなので残す。
 */
export function tidyJapaneseSpaces(s: string): string {
  let prev = '';
  let out = s;
  // 1回では詰めきれない（空白を挟んで連続する）ので変化がなくなるまで回す
  while (out !== prev) {
    prev = out;
    out = out.replace(/([^\x20-\x7E])[ \t]+(?=[^\x20-\x7E])/g, '$1');
  }
  return out.trim();
}

/**
 * 日付・時刻・住所・電話番号・登録番号など、金額ではない数字を伏せる。
 * 行そのものは残し、数字だけ同じ長さの空白に置き換える（行の対応関係を保つため）。
 */
function maskNonAmounts(text: string): string {
  const blank = (m: string) => ' '.repeat(m.length);
  return (
    text
      // 日付: 2026年9月9日 / 2026/09/09 / 26.09.09
      .replace(/\d{2,4}\s*[年/\-.]\s*\d{1,2}\s*[月/\-.]\s*\d{1,2}\s*日?/g, blank)
      // 時刻: 13:45 / 13:45:00
      .replace(/\d{1,2}\s*[:：]\s*\d{2}(\s*[:：]\s*\d{2})?/g, blank)
      // 住所・電話・伝票番号など、ハイフンでつながる数字（金額にハイフンは入らない）
      .replace(/\d+(?:-\d+)+/g, blank)
      // インボイス登録番号
      .replace(/T\d{13}/gi, blank)
      // バーコード・会員番号など桁数が多すぎるもの
      .replace(/\d{8,}/g, blank)
  );
}

const MONEY_RE = /¥?\s?(\d{1,3}(?:,\d{3})+|\d{1,7})\s*円?/g;

/** 1行から金額らしき数字をすべて取り出す */
function numbersIn(line: string): number[] {
  const out: number[] = [];
  for (const m of line.matchAll(MONEY_RE)) {
    const n = Number(m[1].replace(/,/g, ''));
    // 1円未満や桁が多すぎるものはレシートの金額として扱わない
    if (Number.isFinite(n) && n >= 1 && n <= 9_999_999) out.push(n);
  }
  return out;
}

/** 「合計」ラベルだけの行に対して、その行の数字 / 無ければ次の行の数字を使う */
function amountForTotalLine(lines: string[], i: number): number | null {
  const here = numbersIn(lines[i]);
  if (here.length > 0) return Math.max(...here);
  const next = lines[i + 1] ? numbersIn(lines[i + 1]) : [];
  return next.length > 0 ? Math.max(...next) : null;
}

/**
 * 金額の候補を、確からしい順に返す。
 * 1. 「合計」系の行から拾えたもの
 * 2. それ以外の行の数字（大きい順）
 */
export function extractAmounts(normalized: string): AmountCandidate[] {
  const rawLines = normalized.split(/\r?\n/);
  const masked = maskNonAmounts(normalized).split(/\r?\n/);

  const confident: AmountCandidate[] = [];
  const fallback: AmountCandidate[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    const label = rawLines[i].trim();
    if (!label) continue;
    const line = masked[i] ?? '';
    // 空白を落としてからキーワード判定する（OCR が字間に空白を入れるため）
    const key = compact(label);
    const source = tidyJapaneseSpaces(label).slice(0, 24);

    if (TOTAL_RE.test(key) && !EXCLUDE_RE.test(key)) {
      const amount = amountForTotalLine(masked, i);
      if (amount !== null) {
        confident.push({ amount, source, confident: true });
        continue;
      }
    }

    // 除外行の数字は候補から落とす（お預り・お釣り・ポイント・レジ番号など）
    if (EXCLUDE_RE.test(key)) continue;

    for (const n of numbersIn(line)) {
      fallback.push({ amount: n, source, confident: false });
    }
  }

  // 同じ金額は最初の1件だけ残す（確からしい方が先に来る順で並べてから）
  const ordered = [
    ...confident.sort((a, b) => b.amount - a.amount),
    ...fallback.sort((a, b) => b.amount - a.amount),
  ];
  const seen = new Set<number>();
  const unique: AmountCandidate[] = [];
  for (const c of ordered) {
    if (seen.has(c.amount)) continue;
    seen.add(c.amount);
    unique.push(c);
  }
  return unique.slice(0, 6);
}

// --- 日付 -----------------------------------------------------------------

function isoIfValid(year: number, month: number, day: number, today: Date): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const d = new Date(year, month - 1, day, 12);
  if (d.getMonth() + 1 !== month || d.getDate() !== day) return undefined;

  // レシートは過去のもの。未来すぎ・古すぎは誤読とみなす
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  const tenYearsAgo = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate(), 12);
  if (d > tomorrow || d < tenYearsAgo) return undefined;

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** 日付を1つ取り出す。半角数字なので OCR でも比較的よく当たる */
export function extractDate(normalized: string, today: Date = new Date()): string | undefined {
  // 2026年9月9日 / 2026/09/09 / 2026-09-09
  for (const m of normalized.matchAll(
    /(\d{4})\s*[年/\-.]\s*(\d{1,2})\s*[月/\-.]\s*(\d{1,2})\s*日?/g,
  )) {
    const iso = isoIfValid(Number(m[1]), Number(m[2]), Number(m[3]), today);
    if (iso) return iso;
  }
  // 26/09/09 のような2桁年
  for (const m of normalized.matchAll(/(?<!\d)(\d{2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})(?!\d)/g)) {
    const iso = isoIfValid(2000 + Number(m[1]), Number(m[2]), Number(m[3]), today);
    if (iso) return iso;
  }
  return undefined;
}

// --- 店名 -----------------------------------------------------------------

const MERCHANT_NG =
  /(TEL|電話|FAX|〒|領\s*収|レシート|登録番号|No\.|明\s*細|ご来店|ありがとう|株式会社|http|www)/i;

/** 店名の候補。上部の数行から、数字ばかりでない行を拾う */
export function extractMerchants(normalized: string): string[] {
  const out: string[] = [];
  const lines = normalized.split(/\r?\n/).slice(0, 6);
  for (const raw of lines) {
    const line = tidyJapaneseSpaces(
      raw.trim().replace(/^[*＊\-=—\s]+|[*＊\-=—\s]+$/g, ''),
    );
    if (line.length < 2 || line.length > 30) continue;
    if (MERCHANT_NG.test(compact(line))) continue;
    // 住所の行（「渋谷区1-2-3」「〇〇1丁目」）は店名にしない
    if (/\d+-\d+/.test(line) || /丁目/.test(line)) continue;
    // 半分以上が数字・記号の行は店名ではない
    const letters = line.replace(/[\d\s,.\-¥/:()]/g, '');
    if (letters.length < line.length / 2) continue;
    out.push(line);
    if (out.length >= 3) break;
  }
  return out;
}

// --- まとめ ---------------------------------------------------------------

export function parseReceipt(rawText: string, today: Date = new Date()): ReceiptResult {
  const normalized = normalizeText(rawText);
  return {
    amountCandidates: extractAmounts(normalized),
    date: extractDate(normalized, today),
    merchantCandidates: extractMerchants(normalized),
    rawText,
  };
}

// --- 画像の前処理 ---------------------------------------------------------

/**
 * 撮影画像を OCR にかけやすい形に整える。
 * 縮小してグレースケール化し、明暗を引き伸ばす。
 * ここで精度がかなり変わるので、二値化まではせず Tesseract 側に任せる
 * （照明ムラのある写真では自前の二値化がかえって悪化するため）。
 */
export async function preprocessImage(
  file: Blob,
  maxSize = 1600,
): Promise<{ blob: Blob; dataUrl: string }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;

  // グレースケール化しながらヒストグラムを作る
  const hist = new Uint32Array(256);
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    const g = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0;
    gray[p] = g;
    hist[g]++;
  }

  // 上下2%を捨てて、残りを 0-255 に引き伸ばす（コントラスト補正）
  const total = w * h;
  const cut = total * 0.02;
  let lo = 0;
  let hi = 255;
  for (let acc = 0, i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc > cut) {
      lo = i;
      break;
    }
  }
  for (let acc = 0, i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc > cut) {
      hi = i;
      break;
    }
  }
  const range = Math.max(1, hi - lo);

  for (let p = 0, i = 0; p < gray.length; p++, i += 4) {
    const v = Math.max(0, Math.min(255, ((gray[p] - lo) * 255) / range));
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を変換できませんでした'))), 'image/png'),
  );
  return { blob, dataUrl: canvas.toDataURL('image/jpeg', 0.6) };
}

// --- OCR 実行 -------------------------------------------------------------

export type OcrPhase = 'loading' | 'recognizing';

/**
 * アプリに同梱した OCR ファイルの置き場所（`npm run ocr:bundle` が用意する）。
 *
 * 必ず絶対URLにする。corePath / langPath は Web Worker の中に渡され、
 * そこで相対パスとして解決されると worker.min.js の位置が基準になり、
 * `/tesseract/tesseract/...` のように二重になって読み込みに失敗するため。
 */
const LOCAL_OCR_DIR =
  typeof window === 'undefined'
    ? '/tesseract/'
    : new URL(`${import.meta.env.BASE_URL}tesseract/`, document.baseURI).href;

/** 同梱済みかどうかの判定結果。1回調べたら覚えておく */
let localOcrAvailable: boolean | null = null;

/**
 * OCR のファイルをアプリ内に持っているか調べる。
 * 持っていればオフラインでも動く。無ければ CDN から取りに行く（要通信）。
 */
async function hasLocalOcrAssets(): Promise<boolean> {
  if (localOcrAvailable !== null) return localOcrAvailable;
  try {
    const res = await fetch(`${LOCAL_OCR_DIR}lang/jpn.traineddata`, { method: 'HEAD' });
    localOcrAvailable = res.ok;
  } catch {
    localOcrAvailable = false;
  }
  return localOcrAvailable;
}

/** OCR に通信が必要かどうか（UI の案内に使う） */
export async function isOcrOffline(): Promise<boolean> {
  return hasLocalOcrAssets();
}

/**
 * 端末内で OCR を実行する。画像は外部に送信しない。
 *
 * `npm run ocr:bundle` で実行ファイルと日本語の学習データを同梱してあれば、
 * 通信は一切発生しない（ネイティブアプリ / 圏外でもそのまま動く）。
 * 同梱されていない場合だけ、初回に CDN から取得する。
 *
 * tesseract.js は重いので、この関数が呼ばれたときに初めて動的 import する。
 */
export async function recognizeReceipt(
  image: Blob,
  onProgress?: (phase: OcrPhase, progress: number) => void,
): Promise<string> {
  const { createWorker } = await import('tesseract.js');

  const local = await hasLocalOcrAssets();
  const options: Record<string, unknown> = {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.('recognizing', m.progress);
      else onProgress?.('loading', m.progress);
    },
  };

  if (local) {
    options.workerPath = `${LOCAL_OCR_DIR}worker.min.js`;
    options.corePath = LOCAL_OCR_DIR;
    options.langPath = `${LOCAL_OCR_DIR}lang`;
    // 展開済みの .traineddata を置いてあるので、gzip 解凍はさせない
    options.gzip = false;
  }

  const worker = await createWorker('jpn', 1, options);

  try {
    // レシートは1列に文字が並ぶので、単一ブロックとして扱わせる
    await worker.setParameters({ tessedit_pageseg_mode: '6' as never });
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
