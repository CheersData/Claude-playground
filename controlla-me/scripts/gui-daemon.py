"""
GUI Daemon per Claude Code — Automazione sessione interattiva

Scrive messaggi nella sessione Claude Code attiva ogni N minuti.
Toggle on/off con hotkey F9. Il boss lo attiva quando non lavora.

Usage:
  python scripts/gui-daemon.py                    # Default: ogni 10 min
  python scripts/gui-daemon.py --interval 5       # Ogni 5 min
  python scripts/gui-daemon.py --message "custom" # Messaggio custom
  python scripts/gui-daemon.py --once              # Esegui una volta e esci

Hotkeys:
  F9  = Toggle ON/OFF (pausa/riprendi)
  F10 = Esegui subito (skip timer)
  Ctrl+F10 = Esci dal daemon

Requisiti:
  pip install pyautogui pynput
"""

import argparse
import datetime
import json
import os
import sys
import threading
import time

import pyautogui
import pyperclip
from pynput import keyboard

# ─── Config ──────────────────────────────────────────────────────────────────

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_FILE = os.path.join(ROOT, "company", "gui-daemon-state.json")
LOG_DIR = os.path.join(ROOT, "company", "gui-daemon-logs")

DEFAULT_INTERVAL_MIN = 10
DEFAULT_MESSAGE = """daemon ping: controlla il board con `npx tsx scripts/company-tasks.ts board`. Se ci sono task open o in_progress, eseguili. Se non ce ne sono, leggi `company/daemon-report.json` e crea 1-3 task dai signal azionabili più importanti, poi eseguili. Reporta cosa hai fatto in 3-5 righe."""

# Tempo di attesa dopo aver trovato la finestra, prima di scrivere (secondi)
SETTLE_TIME = 1.0
# Timeout attesa dopo invio messaggio (secondi) — non serve aspettare, Claude lavora
TYPE_DELAY = 0.02  # delay tra caratteri per typewrite

# ─── State ───────────────────────────────────────────────────────────────────

class DaemonState:
    def __init__(self):
        self.active = True          # F9 toggle
        self.force_run = False      # F10 immediate run
        self.should_exit = False    # Ctrl+F10 exit
        self.last_run: str | None = None
        self.total_runs = 0
        self.lock = threading.Lock()

    def toggle(self):
        with self.lock:
            self.active = not self.active
            status = "ATTIVO" if self.active else "IN PAUSA"
            log(f"[TOGGLE] Daemon {status} (F9)")

    def trigger_now(self):
        with self.lock:
            self.force_run = True
            log("[TRIGGER] Esecuzione immediata (F10)")

    def exit(self):
        with self.lock:
            self.should_exit = True
            log("[EXIT] Daemon in chiusura (Ctrl+F10)")

state = DaemonState()

# ─── Logging ─────────────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}")

def save_state():
    """Salva stato su file JSON per visibilità esterna"""
    data = {
        "active": state.active,
        "lastRun": state.last_run,
        "totalRuns": state.total_runs,
        "updatedAt": datetime.datetime.now().isoformat(),
    }
    try:
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        with open(STATE_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        log(f"[WARN] Impossibile salvare stato: {e}")

def save_log(message: str, success: bool):
    """Salva log di ogni esecuzione"""
    os.makedirs(LOG_DIR, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y-%m-%d-%H-%M")
    log_file = os.path.join(LOG_DIR, f"{ts}.md")
    content = f"""# GUI Daemon Run — {datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")}

- Success: {success}
- Message: {message[:200]}
- Total runs: {state.total_runs}
"""
    try:
        with open(log_file, "w") as f:
            f.write(content)
    except Exception:
        pass

# ─── Window Management ──────────────────────────────────────────────────────

def find_claude_window():
    """Trova la finestra Claude Code (terminal o VS Code)"""
    try:
        import pygetwindow as gw

        # Cerca finestre con "Claude" nel titolo
        windows = gw.getWindowsWithTitle("Claude")
        if windows:
            return windows[0]

        # Cerca terminale Windows (cmd, PowerShell, Windows Terminal) con Claude
        for title_part in ["claude", "Claude Code", "CLAUDE"]:
            wins = [w for w in gw.getAllWindows() if title_part.lower() in w.title.lower()]
            if wins:
                return wins[0]

        # Cerca Windows Terminal (potrebbe avere Claude Code come tab)
        for w in gw.getAllWindows():
            if "windows terminal" in w.title.lower() or "terminal" in w.title.lower():
                return w

    except Exception as e:
        log(f"[WARN] Errore ricerca finestra: {e}")

    return None

def send_message(message: str) -> bool:
    """
    Invia un messaggio alla sessione Claude Code.
    Usa clipboard per evitare problemi con caratteri speciali.
    """
    try:
        # Trova la finestra Claude Code
        window = find_claude_window()
        if not window:
            log("[ERROR] Finestra Claude Code non trovata. Assicurati che sia aperta.")
            return False

        # Attiva la finestra
        try:
            if window.isMinimized:
                window.restore()
            window.activate()
        except Exception:
            # Su alcuni sistemi activate() fallisce — prova con focus
            try:
                window.focus()
            except Exception:
                pass

        time.sleep(SETTLE_TIME)

        # Usa clipboard per incollare il messaggio (più affidabile di typewrite per unicode)
        old_clipboard = ""
        try:
            old_clipboard = pyperclip.paste()
        except Exception:
            pass

        pyperclip.copy(message)
        time.sleep(0.2)

        # Ctrl+V per incollare
        pyautogui.hotkey("ctrl", "v")
        time.sleep(0.5)

        # Enter per inviare
        pyautogui.press("enter")

        # Ripristina clipboard originale
        try:
            time.sleep(0.3)
            pyperclip.copy(old_clipboard)
        except Exception:
            pass

        return True

    except Exception as e:
        log(f"[ERROR] Errore invio messaggio: {e}")
        return False

# ─── Hotkey Listener ─────────────────────────────────────────────────────────

def setup_hotkeys():
    """Configura hotkey globali con pynput"""

    ctrl_pressed = {"state": False}

    def on_press(key):
        try:
            if key == keyboard.Key.ctrl_l or key == keyboard.Key.ctrl_r:
                ctrl_pressed["state"] = True
            elif key == keyboard.Key.f9:
                state.toggle()
            elif key == keyboard.Key.f10:
                if ctrl_pressed["state"]:
                    state.exit()
                else:
                    state.trigger_now()
        except Exception:
            pass

    def on_release(key):
        try:
            if key == keyboard.Key.ctrl_l or key == keyboard.Key.ctrl_r:
                ctrl_pressed["state"] = False
        except Exception:
            pass

    listener = keyboard.Listener(on_press=on_press, on_release=on_release)
    listener.daemon = True
    listener.start()
    return listener

# ─── Main Loop ───────────────────────────────────────────────────────────────

def run_daemon(interval_min: int, message: str, once: bool = False):
    """Loop principale del daemon"""

    log("=" * 60)
    log("  GUI Daemon per Claude Code")
    log(f"  Intervallo: ogni {interval_min} minuti")
    log(f"  Hotkeys: F9=toggle, F10=esegui ora, Ctrl+F10=esci")
    log("=" * 60)

    # Setup hotkeys
    listener = setup_hotkeys()

    # Prima esecuzione
    log(f"[RUN] Esecuzione #{state.total_runs + 1}")
    success = send_message(message)
    state.total_runs += 1
    state.last_run = datetime.datetime.now().isoformat()
    save_state()
    save_log(message, success)

    if success:
        log("[OK] Messaggio inviato con successo")
    else:
        log("[FAIL] Invio messaggio fallito")

    if once:
        log("[DONE] Modo --once: esco dopo la prima esecuzione")
        return

    # Loop
    log(f"\n[WAIT] Prossima esecuzione tra {interval_min} minuti...")

    while not state.should_exit:
        # Attendi con check frequente per hotkeys
        wait_seconds = interval_min * 60
        for _ in range(wait_seconds * 10):  # check ogni 100ms
            if state.should_exit:
                break
            if state.force_run:
                with state.lock:
                    state.force_run = False
                break
            time.sleep(0.1)

        if state.should_exit:
            break

        if not state.active:
            log("[PAUSA] Daemon in pausa (F9 per riprendere)")
            # Aspetta fino a toggle on
            while not state.active and not state.should_exit:
                if state.force_run:
                    with state.lock:
                        state.force_run = False
                    break
                time.sleep(0.5)
            if state.should_exit:
                break
            if not state.active:
                continue

        # Esegui
        log(f"[RUN] Esecuzione #{state.total_runs + 1}")
        success = send_message(message)
        state.total_runs += 1
        state.last_run = datetime.datetime.now().isoformat()
        save_state()
        save_log(message, success)

        if success:
            log("[OK] Messaggio inviato")
        else:
            log("[FAIL] Invio fallito")

        log(f"[WAIT] Prossima esecuzione tra {interval_min} minuti...")

    log("[EXIT] GUI Daemon terminato.")
    listener.stop()

# ─── Entry Point ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="GUI Daemon per Claude Code")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL_MIN,
                        help=f"Intervallo in minuti (default: {DEFAULT_INTERVAL_MIN})")
    parser.add_argument("--message", type=str, default=DEFAULT_MESSAGE,
                        help="Messaggio da inviare")
    parser.add_argument("--once", action="store_true",
                        help="Esegui una volta e esci")

    args = parser.parse_args()

    try:
        run_daemon(args.interval, args.message, args.once)
    except KeyboardInterrupt:
        log("\n[EXIT] Interrotto da Ctrl+C")
        save_state()

if __name__ == "__main__":
    main()
