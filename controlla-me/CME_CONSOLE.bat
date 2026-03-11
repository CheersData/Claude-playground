@echo off
setlocal enabledelayedexpansion
REM ================================================================
REM  CME_CONSOLE.bat — Console di controllo daemon CME
REM
REM  Comandi:
REM    CME_CONSOLE           — mostra stato
REM    CME_CONSOLE on        — accendi daemon
REM    CME_CONSOLE off       — spegni daemon
REM    CME_CONSOLE freq N    — cambia frequenza a N minuti
REM    CME_CONSOLE log       — mostra ultimo log
REM    CME_CONSOLE logs      — lista ultimi 10 log
REM ================================================================

title CME Daemon Console

cd /d "C:\Users\crist\Claude-playground\controlla-me"

set "STATE_FILE=company\cme-daemon-state.json"
set "LOG_DIR=company\autorun-logs"

REM Se nessun argomento, mostra stato
if "%1"=="" goto :status
if /i "%1"=="status" goto :status
if /i "%1"=="on" goto :enable
if /i "%1"=="off" goto :disable
if /i "%1"=="freq" goto :frequency
if /i "%1"=="log" goto :lastlog
if /i "%1"=="logs" goto :listlogs
if /i "%1"=="help" goto :help

echo Comando sconosciuto: %1
goto :help

:status
echo.
echo  ====================================
echo   CME DAEMON — STATO
echo  ====================================
echo.
if not exist "%STATE_FILE%" (
    echo  Stato: NON INIZIALIZZATO
    echo  Il daemon non e mai stato avviato.
    goto :end
)

REM Leggi stato con node per parsing JSON robusto
node -e "const s=JSON.parse(require('fs').readFileSync('%STATE_FILE:\=/%','utf-8'));const on=s.enabled?'ACCESO':'SPENTO';const lr=s.lastRun?new Date(s.lastRun).toLocaleString('it-IT'):'mai';const ec=s.lastExitCode!==null?s.lastExitCode:'n/a';const dur=s.lastDurationMs!==null?Math.round(s.lastDurationMs/1000)+'s':'n/a';console.log('  Stato:       '+on);console.log('  Frequenza:   ogni '+s.intervalMinutes+' min');console.log('  Ultimo run:  '+lr);console.log('  Durata:      '+dur);console.log('  Exit code:   '+ec);console.log('  Run totali:  '+s.totalRuns);console.log('  Aggiornato:  '+(s.updatedAt?new Date(s.updatedAt).toLocaleString('it-IT'):'mai'))"
echo.
goto :end

:enable
echo.
node -e "const f='%STATE_FILE:\=/%';const s=JSON.parse(require('fs').readFileSync(f,'utf-8'));s.enabled=true;s.updatedAt=new Date().toISOString();s.updatedBy='console';require('fs').writeFileSync(f,JSON.stringify(s,null,2)+'\n');console.log('  Daemon ACCESO')"
echo.
goto :end

:disable
echo.
node -e "const f='%STATE_FILE:\=/%';const s=JSON.parse(require('fs').readFileSync(f,'utf-8'));s.enabled=false;s.updatedAt=new Date().toISOString();s.updatedBy='console';require('fs').writeFileSync(f,JSON.stringify(s,null,2)+'\n');console.log('  Daemon SPENTO')"
echo.
goto :end

:frequency
if "%2"=="" (
    echo  Uso: CME_CONSOLE freq N  ^(es. CME_CONSOLE freq 30^)
    goto :end
)
set "MINS=%2"
echo.
node -e "const f='%STATE_FILE:\=/%';const s=JSON.parse(require('fs').readFileSync(f,'utf-8'));s.intervalMinutes=%MINS%;s.updatedAt=new Date().toISOString();s.updatedBy='console';require('fs').writeFileSync(f,JSON.stringify(s,null,2)+'\n');console.log('  Frequenza aggiornata: ogni %MINS% minuti')"
echo.
goto :end

:lastlog
echo.
if not exist "%LOG_DIR%" (
    echo  Nessun log trovato.
    goto :end
)
REM Trova l'ultimo file .md nella directory
for /f "delims=" %%f in ('dir /b /o-d "%LOG_DIR%\*.md" 2^>nul') do (
    echo  Ultimo log: %LOG_DIR%\%%f
    echo  ====================================
    type "%LOG_DIR%\%%f"
    goto :end
)
echo  Nessun log trovato.
goto :end

:listlogs
echo.
echo  Ultimi 10 log:
echo  ====================================
if not exist "%LOG_DIR%" (
    echo  Nessun log trovato.
    goto :end
)
set "COUNT=0"
for /f "delims=" %%f in ('dir /b /o-d "%LOG_DIR%\*.md" 2^>nul') do (
    set /a COUNT+=1
    if !COUNT! leq 10 (
        echo   !COUNT!. %%f
    )
)
if !COUNT!==0 echo  Nessun log trovato.
echo.
goto :end

:help
echo.
echo  ====================================
echo   CME DAEMON CONSOLE — Comandi
echo  ====================================
echo.
echo   CME_CONSOLE              Mostra stato daemon
echo   CME_CONSOLE on           Accendi daemon
echo   CME_CONSOLE off          Spegni daemon
echo   CME_CONSOLE freq N       Cambia frequenza (minuti)
echo   CME_CONSOLE log          Mostra ultimo log
echo   CME_CONSOLE logs         Lista ultimi 10 log
echo   CME_CONSOLE help         Questo messaggio
echo.
goto :end

:end
if "%1"=="" pause
endlocal
