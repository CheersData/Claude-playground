@echo off
REM ═══════════════════════════════════════════════════════════════════
REM  AVVIA_CME_CONTINUO.bat — CME sempre attivo (loop aggressivo)
REM
REM  Lancia Claude Code CLI in loop continuo:
REM  - Ogni 5 minuti legge il board
REM  - Esegue task open/in_progress
REM  - Genera piani e nuovi task quando il board e vuoto
REM  - Logga tutto in company/autorun-logs/
REM  - Impedisce standby del PC finche attivo
REM
REM  Per cambiare intervallo: CME_CONSOLE freq N
REM  Per fermare: Ctrl+C o chiudi la finestra
REM ═══════════════════════════════════════════════════════════════════

title CME Autorun CONTINUO — Poimandres

cd /d "C:\Users\crist\Claude-playground\controlla-me"

REM === Anti-standby: impedisce al PC di andare in sleep ===
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-dc 0

echo.
echo  ==================================================
echo   CME Autorun CONTINUO — ALWAYS ON
echo   Loop ogni 5 minuti — Ctrl+C per uscire
echo   Standby PC DISABILITATO finche attivo
echo  ==================================================
echo.

where claude >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRORE: 'claude' non trovato nel PATH.
    powercfg /change standby-timeout-ac 30
    powercfg /change monitor-timeout-ac 10
    pause
    exit /b 1
)

npx tsx scripts/cme-autorun.ts --watch --interval 5

REM === Se il daemon termina, ripristina standby ===
echo.
echo CME Daemon terminato. Ripristino impostazioni standby...
powercfg /change standby-timeout-ac 30
powercfg /change monitor-timeout-ac 10
powercfg /change standby-timeout-dc 15
echo Fatto. Premi un tasto per chiudere.
pause
