@echo off
TITLE Installazione Task Scheduler — Controlla.me
echo.
echo Installo il task di avvio automatico per lo scheduler trading...
echo Richiede privilegi di amministratore.
echo.

schtasks /Create /TN "ControllaMeTradingScheduler" /XML "%~dp0scheduler_task.xml" /F

if %ERRORLEVEL% == 0 (
    echo.
    echo SUCCESSO — Task installato.
    echo Lo scheduler si avviera automaticamente ad ogni login.
    echo Puoi gestirlo da: Pannello di controllo > Utilita di pianificazione > ControllaMeTradingScheduler
) else (
    echo.
    echo ERRORE — Prova ad eseguire questo file come Amministratore:
    echo Tasto destro su INSTALLA_TASK_WINDOWS.bat > Esegui come amministratore
)

echo.
pause
