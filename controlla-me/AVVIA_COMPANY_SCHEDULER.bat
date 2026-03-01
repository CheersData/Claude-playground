@echo off
REM ═══════════════════════════════════════════════════════════
REM  COMPANY SCHEDULER DAEMON — CME
REM  Daemon di pianificazione con approvazione Telegram.
REM
REM  Cosa fa:
REM    - Polling board ogni 5 minuti
REM    - Quando open=0 E in_progress=0: genera piano con claude -p
REM    - Invia piano su Telegram per approvazione boss
REM    - Boss clicca ✅ Approva → task creati automaticamente
REM    - Boss clicca ✏️ Modifica → rigenerazione
REM    - Boss clicca ❌ Annulla → cooldown 30 min
REM
REM  Setup Telegram (una volta sola):
REM    1. Parla con @BotFather su Telegram → /newbot → copia TOKEN
REM    2. Aggiungi a .env.local:
REM         TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
REM    3. Manda qualsiasi messaggio al tuo bot
REM    4. Esegui:
REM         npx tsx scripts/company-scheduler-daemon.ts --setup
REM       → copia il CHAT_ID e aggiungilo a .env.local:
REM         TELEGRAM_CHAT_ID=987654321
REM
REM  Comandi Telegram (dal telefono):
REM    /status   — Stato board
REM    /cancella — Annulla piano corrente
REM    /help     — Lista comandi
REM ═══════════════════════════════════════════════════════════

title CME Company Scheduler Daemon

echo.
echo  ╔═══════════════════════════════════════════╗
echo  ║    CME COMPANY SCHEDULER DAEMON           ║
echo  ║    Controlla.me — Telegram Approval Loop  ║
echo  ╚═══════════════════════════════════════════╝
echo.
echo  Il daemon monitora il board ogni 5 minuti.
echo  Riceverai un piano su Telegram quando il board e' vuoto.
echo.
echo  CTRL+C per fermare. Non chiudere questa finestra.
echo.

REM Impedisce lo standby finché questa finestra è aperta
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change monitor-timeout-ac 0 >nul 2>&1

REM Vai alla cartella del progetto
cd /d "C:\Users\crist\Claude-playground\controlla-me"

:RESTART
echo [%date% %time%] Avvio daemon...
npx tsx scripts/company-scheduler-daemon.ts
echo.
echo [%date% %time%] Daemon terminato. Riavvio tra 10 secondi...
echo Premi CTRL+C per uscire.
timeout /t 10 /nobreak >nul
goto RESTART

REM Ripristina standby alla chiusura (viene eseguito solo se si esce dal loop)
powercfg /change standby-timeout-ac 30 >nul 2>&1
powercfg /change monitor-timeout-ac 10 >nul 2>&1
