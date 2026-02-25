@echo off
title controlla.me - Setup PC Nuovo
color 0B

echo.
echo  ================================================================
echo     controlla.me - Setup Completo per PC Nuovo
echo  ================================================================
echo.
echo  Questo script installa tutto il necessario:
echo    - Node.js 22
echo    - Python 3
echo    - VS Code + estensioni
echo    - Dipendenze npm
echo    - Configurazione ambiente
echo.
echo  REQUISITO: Git deve essere gia installato.
echo             Scaricalo da https://git-scm.com se non lo hai.
echo.
echo  NOTA: Servono i permessi di Amministratore.
echo.
pause

:: Verifica che Git sia disponibile
git --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  [ERRORE] Git non trovato!
    echo  Installalo da: https://git-scm.com/download/win
    echo  Poi rilancia questo script.
    echo.
    pause
    exit /b 1
)

:: Lancia PowerShell come Amministratore con lo script di setup
echo.
echo  Avvio setup in PowerShell...
echo.

:: Determina il percorso dello script PowerShell
:: Se siamo nella cartella del progetto (dopo clone)
if exist "%~dp0scripts\setup-new-pc.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0scripts\setup-new-pc.ps1"
    goto :end
)

:: Se lo script e' nella stessa cartella del .bat
if exist "%~dp0setup-new-pc.ps1" (
    powershell -ExecutionPolicy Bypass -File "%~dp0setup-new-pc.ps1"
    goto :end
)

:: Fallback: scarica ed esegui da GitHub
echo  Script locale non trovato. Scarico da GitHub...
echo.
powershell -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/CheersData/Claude-playground/master/controlla-me/scripts/setup-new-pc.ps1 | iex"

:end
echo.
pause
