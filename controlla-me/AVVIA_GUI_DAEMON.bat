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

cd /d "%~dp0"
python scripts/gui-daemon.py --interval 10

pause
