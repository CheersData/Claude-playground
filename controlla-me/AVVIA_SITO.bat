@echo off
title controlla.me - Setup e Avvio
color 0A

echo.
echo  ============================================
echo     controlla.me - Setup Completo + Avvio
echo  ============================================
echo.

:: Vai alla root del repo
cd /d "C:\Users\MarcoCristofori\Claude-playground"

echo  [1/4] Scarico gli ultimi aggiornamenti...
echo.
git fetch origin claude/review-code-instructions-9aGkc
git checkout claude/review-code-instructions-9aGkc
git pull origin claude/review-code-instructions-9aGkc
echo.

:: Vai nella cartella del progetto
cd /d "C:\Users\MarcoCristofori\Claude-playground\controlla-me"

echo  [2/4] Verifico che i file ci siano...
if not exist "package.json" (
    echo.
    echo  ERRORE: package.json non trovato!
    echo  Controlla che il branch sia corretto.
    echo.
    pause
    exit /b 1
)
echo  OK - package.json trovato
echo.

echo  [3/4] Installazione dipendenze...
call npm install
echo.

echo  [4/4] Avvio server di sviluppo...
echo.
echo  ============================================
echo     Apri nel browser: http://localhost:3000
echo     Per fermare: CTRL+C
echo  ============================================
echo.

call npm run dev

pause
