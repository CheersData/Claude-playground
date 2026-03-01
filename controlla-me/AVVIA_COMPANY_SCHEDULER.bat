@echo off
REM ═══════════════════════════════════════════════════════════
REM  COMPANY SCHEDULER — CME
REM  Avvia il loop di pianificazione aziendale con approvazione Telegram.
REM
REM  Cosa fa:
REM    - Controlla il task board ogni 30 minuti
REM    - Quando board vuoto: genera piano e lo manda via Telegram
REM    - Boss approva/rifiuta con un click dal telefono
REM    - Su approvazione: task creati automaticamente
REM
REM  Setup Telegram (una volta sola):
REM    1. Parla con @BotFather su Telegram → /newbot → copia TOKEN
REM    2. Manda /start al tuo nuovo bot
REM    3. Apri: https://api.telegram.org/bot{TOKEN}/getUpdates
REM       → trova "chat" → "id" → è il tuo CHAT_ID
REM    4. Aggiungi a .env.local:
REM         TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrSTUvwxYZ
REM         TELEGRAM_CHAT_ID=987654321
REM
REM  Senza Telegram: funziona in modalità console (piano stampato a schermo).
REM ═══════════════════════════════════════════════════════════

title CME Company Scheduler

echo.
echo  ╔═══════════════════════════════════╗
echo  ║    CME COMPANY SCHEDULER          ║
echo  ║    Controlla.me — Virtual CEO     ║
echo  ╚═══════════════════════════════════╝
echo.

REM Impedisce lo standby finché questa finestra è aperta
powercfg /change standby-timeout-ac 0 >nul 2>&1
powercfg /change monitor-timeout-ac 0 >nul 2>&1

REM Vai alla cartella del progetto
cd /d "C:\Users\crist\Claude-playground\controlla-me"

echo  Avvio scheduler...
echo  (Chiudi questa finestra per fermare lo scheduler)
echo.

npx tsx scripts/company-scheduler.ts

REM Ripristina standby quando lo scheduler termina
powercfg /change standby-timeout-ac 30 >nul 2>&1
powercfg /change monitor-timeout-ac 10 >nul 2>&1

echo.
echo  Scheduler terminato.
pause
