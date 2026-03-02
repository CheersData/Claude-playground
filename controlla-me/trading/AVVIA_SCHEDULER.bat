@echo off
TITLE Trading Scheduler — Controlla.me

REM Impedisce lo standby finche questa finestra e aperta
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /change standby-timeout-dc 0

echo =========================================
echo  TRADING SCHEDULER — Controlla.me
echo  %DATE% %TIME%
echo  Standby disabilitato.
echo  Chiudi questa finestra per fermare.
echo =========================================
echo.

REM Vai nella cartella trading
cd /d %~dp0

REM Lancia lo scheduler Python
python -m src.scheduler

REM Se lo scheduler termina (crash o stop manuale), ripristina standby
echo.
echo Scheduler terminato. Ripristino impostazioni standby...
powercfg /change standby-timeout-ac 30
powercfg /change monitor-timeout-ac 10
powercfg /change standby-timeout-dc 15

echo Fatto. Premi un tasto per chiudere.
pause
