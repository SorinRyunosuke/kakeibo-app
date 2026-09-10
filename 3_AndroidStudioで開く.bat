@echo off
cd /d "%~dp0"

echo ============================================
echo  Android アプリ(APK)のビルド
echo ============================================
echo.

rem --- Android Studio を探す --------------------------------
set "STUDIO="
if exist "%ProgramFiles%\Android\Android Studio\bin\studio64.exe" set "STUDIO=%ProgramFiles%\Android\Android Studio"
if exist "%LOCALAPPDATA%\Programs\Android Studio\bin\studio64.exe" set "STUDIO=%LOCALAPPDATA%\Programs\Android Studio"

if not defined STUDIO goto NOSTUDIO

rem --- Android Studio 同梱の JDK を使う（PATH に無くてもよい） -----
if exist "%STUDIO%\jbr\bin\java.exe" set "JAVA_HOME=%STUDIO%\jbr"

rem --- Android SDK が入っているか ----------------------------
set "SDK=%LOCALAPPDATA%\Android\Sdk"
if defined ANDROID_HOME set "SDK=%ANDROID_HOME%"
if not exist "%SDK%\platforms" goto NOSDK

echo Web をビルドして Android プロジェクトへ同期します...
echo.
call npm.cmd run android:sync
if errorlevel 1 goto FAILED

echo.
echo Android Studio を起動します...
call npx.cmd cap open android
if errorlevel 1 goto FAILED

echo.
echo Android Studio が開いたら:
echo   1. USB でスマホを接続（開発者オプション: USBデバッグ を ON）
echo   2. 画面上部の再生ボタン（緑の三角）を押す
echo.
pause
exit /b 0

:NOSTUDIO
echo [!] Android Studio が見つかりません。
echo     https://developer.android.com/studio からインストールしてください。
echo.
pause
exit /b 1

:NOSDK
echo [!] Android SDK がまだ入っていません。
echo.
echo     Android Studio を一度起動して、最初に出るセットアップ画面を
echo     最後まで進めてください（SDK が自動でダウンロードされます）。
echo     1?2GB のダウンロードがあります。
echo.
echo     終わったら、もう一度このファイルを実行してください。
echo.
echo     ※ Android Studio を起動します...
start "" "%STUDIO%\bin\studio64.exe"
pause
exit /b 1

:FAILED
echo.
echo *** 失敗しました。上のメッセージを確認してください ***
pause
exit /b 1