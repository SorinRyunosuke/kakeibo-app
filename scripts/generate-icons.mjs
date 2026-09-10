// ============================================================================
// PWA 用アイコン（PNG）を生成する。
//
// Android のホーム画面追加には 192px / 512px の PNG が要る（SVG では不可）。
// 画像ライブラリを足さずに済むよう、PNG エンコーダとラスタライザを自前で持つ。
//
//   node scripts/generate-icons.mjs
//
// 出力: public/icon-192.png / icon-512.png / icon-maskable-512.png
//       public/apple-touch-icon.png
// ============================================================================

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// --- PNG エンコーダ --------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA バッファ（size×size）を PNG にする */
function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  // 10..12 = compression / filter / interlace = 0

  // 各行の先頭にフィルタタイプ 0 を付ける
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- 図形の判定 ------------------------------------------------------------

const clamp01 = (v) => Math.max(0, Math.min(1, v));

function inRoundedRect(x, y, w, h, r) {
  const dx = Math.max(r - x, 0, x - (w - r));
  const dy = Math.max(r - y, 0, y - (h - r));
  return dx * dx + dy * dy <= r * r;
}

/** 円環の一部（開始角から時計回りに sweep 度）に入っているか */
function inArc(x, y, cx, cy, rOuter, rInner, startDeg, sweepDeg) {
  const dx = x - cx;
  const dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d < rInner || d > rOuter) return false;
  // 12時方向を 0 度として時計回りに測る
  let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (a < 0) a += 360;
  let rel = a - startDeg;
  if (rel < 0) rel += 360;
  return rel <= sweepDeg;
}

/** 太さのある線分 */
function inLine(x, y, x1, y1, x2, y2, width) {
  const vx = x2 - x1;
  const vy = y2 - y1;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : clamp01(((x - x1) * vx + (y - y1) * vy) / len2);
  const px = x1 + t * vx;
  const py = y1 + t * vy;
  return Math.hypot(x - px, y - py) <= width / 2;
}

// --- アイコンの描画 --------------------------------------------------------

const GREEN_TOP = [0x34, 0xb9, 0x8a];
const GREEN_BOTTOM = [0x0a, 0x8f, 0x61];
const WHITE = [0xff, 0xff, 0xff];

/**
 * @param {number} size   出力サイズ
 * @param {boolean} maskable  true なら角丸なし・中身を小さめ（Android のマスク対応）
 */
function drawIcon(size, maskable) {
  const SS = 4; // スーパーサンプリング倍率（これでアンチエイリアスをかける）
  const S = size * SS;

  // マスク領域に食われないよう、maskable では中身を内側に寄せる
  const contentScale = maskable ? 0.56 : 0.74;
  const cx = S / 2;
  const cy = S / 2;
  const rOuter = (S * contentScale) / 2;
  const rInner = rOuter - S * (maskable ? 0.072 : 0.095);

  // 中央の ¥ 記号（線分の集まりとして描く）
  const g = rInner * 0.92; // 記号を収める半径
  const strokeW = S * (maskable ? 0.035 : 0.046);
  const topY = cy - g * 0.62;
  const midY = cy - g * 0.02;
  const botY = cy + g * 0.66;
  const armX = g * 0.52;
  const barW = g * 0.5;

  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5;
          const py = y * SS + sy + 0.5;

          // 背景（角丸 or 全面）
          const bg = maskable ? true : inRoundedRect(px, py, S, S, S * 0.22);
          if (!bg) continue;

          // 縦方向のグラデーション
          const t = py / S;
          let cr = GREEN_TOP[0] + (GREEN_BOTTOM[0] - GREEN_TOP[0]) * t;
          let cg = GREEN_TOP[1] + (GREEN_BOTTOM[1] - GREEN_TOP[1]) * t;
          let cb = GREEN_TOP[2] + (GREEN_BOTTOM[2] - GREEN_TOP[2]) * t;

          // 使用率リング（12時から時計回りに 265度）を白で乗せる
          const onRing = inArc(px, py, cx, cy, rOuter, rInner, 0, 265);

          // ¥ 記号
          const onYen =
            inLine(px, py, cx - armX, topY, cx, midY, strokeW) ||
            inLine(px, py, cx + armX, topY, cx, midY, strokeW) ||
            inLine(px, py, cx, midY, cx, botY, strokeW) ||
            inLine(px, py, cx - barW, midY + g * 0.2, cx + barW, midY + g * 0.2, strokeW) ||
            inLine(px, py, cx - barW, midY + g * 0.42, cx + barW, midY + g * 0.42, strokeW);

          if (onRing || onYen) {
            cr = WHITE[0];
            cg = WHITE[1];
            cb = WHITE[2];
          }

          rSum += cr;
          gSum += cg;
          bSum += cb;
          aSum += 255;
        }
      }

      const n = SS * SS;
      const i = (y * size + x) * 4;
      const a = aSum / n;
      // 半透明部分は色を潰さないよう、カバレッジで割って戻す
      const k = a > 0 ? n / (aSum / 255) : 0;
      rgba[i] = Math.round((rSum / n) * k);
      rgba[i + 1] = Math.round((gSum / n) * k);
      rgba[i + 2] = Math.round((bSum / n) * k);
      rgba[i + 3] = Math.round(a);
    }
  }

  return encodePng(rgba, size);
}

// --- 出力 ------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  // ネイティブアプリのアイコン生成 (@capacitor/assets) の元画像
  ['../resources/icon.png', 1024, true],
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  // iOS はアイコンに自前でマスクをかけるので全面塗り
  ['apple-touch-icon.png', 180, true],
];

for (const [name, size, maskable] of targets) {
  const png = drawIcon(size, maskable);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
