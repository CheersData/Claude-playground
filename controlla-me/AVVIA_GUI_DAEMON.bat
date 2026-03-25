@echo off
chcp 65001 >nul
title GUI Daemon — Claude Code Bot
echo.
echo   ==================================================
echo    GUI Daemon per Claude Code
echo    Scrive nella sessione attiva ogni 10 minuti
echo   ==================================================
echo.
echo    COMANDI:
echo    ------------------------------------------------
echo     F9         Pausa / Riprendi
echo     F10        Esegui subito (skip timer)
echo     Ctrl+F10   Esci dal daemon
echo    ------------------------------------------------
echo.
echo    TIP: Usa --target per scegliere la finestra giusta
echo         python scripts/gui-daemon.py --list-windows
echo.

cd /d "%~dp0"

REM --target matcha il substring nel titolo della finestra Claude Code
REM Cambia "controlla-me" con il nome del progetto/finestra target
python scripts/gui-daemon.py --interval 10 --target "poimandres"

pause
