@echo off
chcp 65001 >nul
title GUI Daemon — Claude Code Bot
echo ==================================================
echo   GUI Daemon per Claude Code
echo   Scrive nella sessione attiva ogni 10 minuti
echo   F9 = Pausa/Riprendi, F10 = Esegui ora
echo   Ctrl+F10 = Esci
echo ==================================================
echo.

cd /d "%~dp0"
python scripts/gui-daemon.py --interval 10

pause
