@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  AVVIA_CME_CONTINUO.bat — CME sempre attivo (loop ogni 60 min)
REM
REM  Lancia Claude Code CLI in loop continuo:
REM  - Ogni 60 minuti legge il board
REM  - Esegue task open/in_progress
REM  - Genera piani coerenti con vision/mission dipartimenti
REM  - Logga tutto in company/autorun-logs/
REM
REM  Per cambiare intervallo: modificare --interval N (minuti)
REM  Per fermare: Ctrl+C o chiudi la finestra
REM ═══════════════════════════════════════════════════════════════════

title CME Autorun CONTINUO — Poimandres

cd /d "C:\Users\crist\Claude-playground\controlla-me"

echo.
echo  ══════════════════════════════════════════
echo   CME Autorun CONTINUO
echo   Loop ogni 15 minuti — Ctrl+C per uscire
echo  ══════════════════════════════════════════
echo.

where claude >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRORE: 'claude' non trovato nel PATH.
    pause
    exit /b 1
)

npx tsx scripts/cme-autorun.ts --watch --interval 15
