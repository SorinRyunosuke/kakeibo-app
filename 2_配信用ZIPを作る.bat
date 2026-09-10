@echo off
cd /d "%~dp0"
echo ============================================
echo  アップロード用の ZIP を作ります
echo ============================================
echo.
call npm.cmd run zip
if errorlevel 1 (
  echo.
  echo *** 失敗しました。上のメッセージを確認してください ***
) else (
  echo.
  echo できあがり: %~dp0kakeibo-site.zip
  echo このファイルを https://app.netlify.com/drop にドロップしてください。
)
echo.
pause