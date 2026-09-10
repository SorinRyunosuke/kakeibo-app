@echo off
cd /d "%~dp0"
echo ============================================
echo  開発サーバーを起動します
echo  ブラウザで http://localhost:5173 を開いてください
echo  止めるときは Ctrl+C
echo ============================================
echo.
call npm.cmd run dev
pause