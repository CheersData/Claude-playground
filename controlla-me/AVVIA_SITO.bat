@echo off
title controlla.me - Dev Server
color 0A

echo ==========================================
echo    controlla.me - Avvio Dev Server
echo ==========================================
echo.

cd /d "%~dp0"

echo [1/2] Installazione dipendenze...
call npm install

echo.
echo [2/2] Avvio server di sviluppo...
echo.
echo    Apri nel browser: http://localhost:3000
echo    Per fermare: CTRL+C
echo ==========================================
echo.

call npm run dev

pause
