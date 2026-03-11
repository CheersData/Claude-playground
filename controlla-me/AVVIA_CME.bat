@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  AVVIA_CME.bat — Lancia sessione CME autonoma via Claude Code CLI
REM
REM  Uso:
REM    Doppio click     — sessione singola
REM    Task Scheduler   — schedulare ogni 30-60 minuti
REM
REM  Requisiti:
REM    - Claude Code CLI installato e nel PATH
REM    - Node.js 18+ installato
REM    - NON eseguire dentro una sessione Claude Code attiva
REM ═══════════════════════════════════════════════════════════════════

title CME Autorun — Poimandres

REM Vai alla directory del progetto
cd /d "C:\Users\crist\Claude-playground\controlla-me"

echo.
echo  ══════════════════════════════════════════
echo   CME Autorun — %date% %time:~0,5%
echo  ══════════════════════════════════════════
echo.

REM Verifica che claude sia disponibile
where claude >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRORE: 'claude' non trovato nel PATH.
    echo Installa Claude Code CLI: npm install -g @anthropic-ai/claude-code
    pause
    exit /b 1
)

REM Verifica che node sia disponibile
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRORE: 'node' non trovato nel PATH.
    pause
    exit /b 1
)

REM Lancia sessione CME
echo Avvio sessione CME autonoma...
echo.
npx tsx scripts/cme-autorun.ts

echo.
echo Sessione completata. Log in company\autorun-logs\
echo.

REM Se lanciato da doppio click, pausa prima di chiudere
if "%1"=="" pause
