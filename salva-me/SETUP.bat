@echo off
echo.
echo =========================================
echo   SOLDI PERSI - Setup Rapido
echo =========================================
echo.

REM Vai nella cartella del progetto
cd /d "%~dp0soldi-persi"

REM Crea virtual environment se non esiste
if not exist ".venv" (
    echo [1/3] Creo virtual environment...
    python -m venv .venv
    echo   OK
) else (
    echo [1/3] Virtual environment gia' presente
)

REM Installa dipendenze
echo [2/3] Installo dipendenze Python...
.venv\Scripts\pip install -r requirements.txt -q
echo   OK

REM Crea .env se non esiste
if not exist ".env" (
    echo [3/3] Creo file .env...
    copy .env.example .env >nul
    echo.
    echo =============================================
    echo   IMPORTANTE: Apri il file .env e inserisci
    echo   la tua ANTHROPIC_API_KEY!
    echo =============================================
    echo.
    echo Premi un tasto per aprire .env in Notepad...
    pause >nul
    notepad .env
) else (
    echo [3/3] File .env gia' presente
)

echo.
echo =========================================
echo   SETUP COMPLETATO!
echo =========================================
echo.
echo Ora apri un terminale qui e lancia:
echo   cd soldi-persi
echo   claude
echo.
echo Poi digli:
echo   "Leggi docs/ARCHITECTURE.md e docs/CLAUDE_CODE_BOOTSTRAP.md e costruisci tutto il progetto step by step"
echo.
pause
