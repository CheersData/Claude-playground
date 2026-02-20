@echo off
title Soldi Persi - Server Web
color 0A
echo.
echo  ================================================
echo        SOLDI PERSI - Avvio Server Web
echo  ================================================
echo.

cd /d "%~dp0"

REM Attiva il virtual environment
if exist ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
    echo  [OK] Virtual environment attivato
) else (
    echo  [!] Virtual environment non trovato, provo senza...
)

echo.
echo  Avvio del server su http://localhost:8000
echo  Il browser si apre tra 3 secondi...
echo.
echo  Per CHIUDERE il server premi Ctrl+C in questa finestra
echo  ================================================
echo.

REM Apri il browser dopo 3 secondi
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:8000"

REM Avvia uvicorn
python -m uvicorn app.main:app --reload --port 8000
