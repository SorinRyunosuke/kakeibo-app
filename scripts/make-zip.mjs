// ============================================================================
// dist/ の中身を kakeibo-site.zip にまとめる。
// Netlify Drop などへドラッグ&ドロップでアップロードするため。
//
//   npm run zip     （ビルドしてから ZIP を作る）
//
// 注意点:
//  - index.html が ZIP の最上位に来るようにする（dist フォルダごと入れない）
//  - パス区切りは "/" にする。Windows の Compress-Archive は "\" を書き込むため
//    配信サービス側で assets/ が展開されないことがある
// ============================================================================

import { deflateRawSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'kakeibo-site.zip');

// --- CRC32 -----------------------------------------------------------------

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

// --- ファイル収集 -----------------------------------------------------------

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

// --- ZIP 書き出し -----------------------------------------------------------

/** MS-DOS 形式の日時（ZIP のヘッダで使う） */
function dosTime(d) {
  const time = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff;
  const date =
    (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
  return { time, date };
}

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = e.data;
    const compressed = deflateRawSync(raw, { level: 9 });
    // 圧縮して大きくなるなら無圧縮で入れる
    const useDeflate = compressed.length < raw.length;
    const body = useDeflate ? compressed : raw;
    const method = useDeflate ? 8 : 0;
    const { time, date } = dosTime(e.mtime);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 のファイル名
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}

// --- 実行 ------------------------------------------------------------------

let files;
try {
  files = walk(DIST);
} catch {
  console.error('dist/ が見つかりません。先に `npm run build` を実行してください。');
  process.exit(1);
}

const entries = files.map((full) => ({
  // ZIP の仕様上、区切りは必ず "/"
  name: relative(DIST, full).split(sep).join('/'),
  data: readFileSync(full),
  mtime: statSync(full).mtime,
}));

if (!entries.some((e) => e.name === 'index.html')) {
  console.error('dist/index.html がありません。ビルドが正しく終わっているか確認してください。');
  process.exit(1);
}

writeFileSync(OUT, buildZip(entries));

console.log(`kakeibo-site.zip を作成しました  (${(statSync(OUT).size / 1024).toFixed(1)} KB)`);
console.log(OUT);
console.log('');
console.log('内容:');
for (const e of entries) console.log(`  ${e.name}`);
