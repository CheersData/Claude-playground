@echo off
echo.
echo Lancio Claude Code per Soldi Persi...
echo.
cd /d "%~dp0soldi-persi"

REM Verifica che .env esista
if not exist ".env" (
    echo ERRORE: File .env non trovato!
    echo Esegui prima SETUP.bat
    pause
    exit /b 1
)

REM Verifica che la API key sia stata inserita
findstr /C:"sk-ant-..." .env >nul 2>&1
if %errorlevel%==0 (
    echo ERRORE: Devi inserire la tua ANTHROPIC_API_KEY nel file .env!
    echo Apri: %cd%\.env
    pause
    exit /b 1
)

echo Claude Code si apre ora.
echo.
echo Digli:
echo   "Leggi docs/ARCHITECTURE.md e docs/CLAUDE_CODE_BOOTSTRAP.md e costruisci tutto il progetto step by step"
echo.
claude
