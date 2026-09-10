// ============================================================================
// APK をビルドする。
//
//   npm run android:apk
//
// Android Studio に同梱されている JDK を自動で見つけて使うので、
// JAVA_HOME を自分で設定する必要はない。
// （Android Studio をインストールしても java は PATH に入らないため）
// ============================================================================

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_DIR = join(ROOT, 'android');

function fail(message) {
  console.error('');
  console.error(message);
  process.exit(1);
}

// --- Android Studio と同梱 JDK を探す ---------------------------------------

const STUDIO_CANDIDATES = [
  join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio'),
  join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Android Studio'),
];

const studio = STUDIO_CANDIDATES.find((p) => p && existsSync(join(p, 'bin', 'studio64.exe')));

let javaHome = process.env.JAVA_HOME;
if (!javaHome && studio && existsSync(join(studio, 'jbr', 'bin', 'java.exe'))) {
  javaHome = join(studio, 'jbr');
  console.log(`JDK: Android Studio 同梱のものを使います (${javaHome})`);
}

if (!javaHome) {
  fail(
    'JDK が見つかりません。\n' +
      'Android Studio をインストールするか、JAVA_HOME を設定してください。\n' +
      'https://developer.android.com/studio',
  );
}

// --- Android SDK を確認 -----------------------------------------------------

const sdk =
  process.env.ANDROID_HOME ??
  process.env.ANDROID_SDK_ROOT ??
  join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk');

if (!existsSync(join(sdk, 'platforms'))) {
  fail(
    'Android SDK がまだ入っていません。\n' +
      'Android Studio を一度起動し、最初のセットアップ画面を最後まで進めてください\n' +
      '（SDK が自動でダウンロードされます。1〜2GB あります）。\n' +
      `探した場所: ${sdk}`,
  );
}

// --- ビルド -----------------------------------------------------------------

if (!existsSync(join(ANDROID_DIR, 'gradlew.bat'))) {
  fail('android/ が見つかりません。`npx cap add android` を実行してください。');
}

console.log('APK をビルドしています... (初回は数分かかります)');

// Norton などのセキュリティソフトが SSL 通信をスキャンしている環境では、
// システムの Java が持つ証明書ストアに、その独自証明書が含まれておらず
// Gradle のダウンロードが SSL エラーで失敗することがある。
// プロジェクト内に用意した専用の証明書ストア（scripts/setup-cert.mjs で作成）が
// あれば、そちらを信頼させる。
const customTrustStore = join(ANDROID_DIR, 'gradle-cacerts.jks');
const gradleOpts = existsSync(customTrustStore)
  ? `-Djavax.net.ssl.trustStore=${customTrustStore} -Djavax.net.ssl.trustStorePassword=changeit`
  : '';

try {
  execFileSync(join(ANDROID_DIR, 'gradlew.bat'), ['assembleDebug'], {
    cwd: ANDROID_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      JAVA_HOME: javaHome,
      ANDROID_HOME: sdk,
      GRADLE_OPTS: gradleOpts,
      JAVA_OPTS: gradleOpts,
    },
  });
} catch {
  fail('ビルドに失敗しました。上のメッセージを確認してください。');
}

const apk = join(ANDROID_DIR, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
console.log('');
if (existsSync(apk)) {
  console.log('APK ができました:');
  console.log(`  ${apk}`);
  console.log('');
  console.log('このファイルをスマホに転送してタップするとインストールできます。');
} else {
  console.log('ビルドは終わりましたが APK が見つかりません:', apk);
}
