"""
GUI Daemon per Claude Code — Automazione sessione interattiva

Scrive messaggi nella sessione Claude Code attiva ogni N minuti.
Toggle on/off con hotkey F9. Il boss lo attiva quando non lavora.

Usage:
  python scripts/gui-daemon.py                          # Default: ogni 10 min, directive da daemon-report.json
  python scripts/gui-daemon.py --interval 5             # Ogni 5 min
  python scripts/gui-daemon.py --message "custom"       # Messaggio custom (override directive)
  python scripts/gui-daemon.py --once                    # Esegui una volta e esci
  python scripts/gui-daemon.py --no-dedup                # Skip deduplicazione timestamp (test)
  python scripts/gui-daemon.py --target "controlla-me"  # Cerca SOLO finestre con questo nel titolo
  python scripts/gui-daemon.py --list-windows            # Mostra finestre candidate (debug)

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
DAEMON_REPORT_FILE = os.path.join(ROOT, "company", "daemon-report.json")
LOG_DIR = os.path.join(ROOT, "company", "gui-daemon-logs")

# Processi browser validi — Claude Code gira nel browser, SOLO qui si incolla
ALLOWED_PROCESSES = {
    "chrome.exe", "msedge.exe", "firefox.exe", "brave.exe", "opera.exe",
    "arc.exe", "vivaldi.exe",
}
# Processi da escludere SEMPRE — mai incollare qui
BLOCKED_PROCESSES = {
    "explorer.exe", "code.exe", "notepad.exe", "notepad++.exe",
    "windowsterminal.exe", "powershell.exe", "pwsh.exe",
    "cmd.exe", "mintty.exe", "conhost.exe", "wt.exe",
}

DEFAULT_INTERVAL_MIN = 10

# Tempo di attesa dopo aver trovato la finestra, prima di scrivere (secondi)
SETTLE_TIME = 5.0
# Timeout attesa dopo invio messaggio (secondi) — non serve aspettare, Claude lavora
TYPE_DELAY = 0.02  # delay tra caratteri per typewrite

# Target finestra — se specificato, matcha solo finestre con questo substring nel titolo
TARGET_WINDOW: str | None = None

# ─── State ───────────────────────────────────────────────────────────────────

class DaemonState:
    def __init__(self):
        self.active = True          # F9 toggle
        self.force_run = False      # F10 immediate run
        self.should_exit = False    # Ctrl+F10 exit
        self.last_run: str | None = None
        self.total_runs = 0
        self.last_directive_ts: str | None = None  # Deduplicazione direttiva daemon
        self.lock = threading.Lock()
        self._load_last_directive_ts()

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

    def _load_last_directive_ts(self):
        """Carica lastDirectiveTs dal file di stato (persistenza tra restart)"""
        try:
            if os.path.exists(STATE_FILE):
                with open(STATE_FILE, "r") as f:
                    data = json.load(f)
                    self.last_directive_ts = data.get("lastDirectiveTs")
        except Exception:
            pass

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
        "lastDirectiveTs": state.last_directive_ts,
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

# ─── Directive Loading ─────────────────────────────────────────────────────

def format_directive(report_ts: str, directive: dict) -> str:
    """
    Formatta la direttiva daemon come messaggio testuale.
    Stessa logica di CompanyPanel.tsx per coerenza web ↔ terminal.
    """
    try:
        dt = datetime.datetime.fromisoformat(report_ts.replace("Z", "+00:00"))
        time_str = dt.strftime("%H:%M")
    except Exception:
        time_str = "??:??"

    mode = str(directive.get("mode", "unknown")).upper()
    instructions = str(directive.get("instructions", ""))

    lines = [
        f"[DAEMON DIRECTIVE — {time_str}]",
        f"Modo: {mode}",
        "",
        instructions,
    ]

    open_batch = directive.get("openTasksBatch", [])
    if isinstance(open_batch, list) and len(open_batch) > 0:
        lines.append("")
        lines.append("Task batch:")
        for t in open_batch:
            lines.append(f"  • {t}")

    in_progress = directive.get("inProgressToAudit", [])
    if isinstance(in_progress, list) and len(in_progress) > 0:
        lines.append("")
        lines.append("In-progress da auditare:")
        for t in in_progress:
            lines.append(f"  • {t}")

    return "\n".join(lines)


def load_directive(skip_dedup: bool = False) -> str | None:
    """
    Legge daemon-report.json, estrae cmeDirective, formatta il messaggio.
    Ritorna None se:
      - Il file non esiste o non è leggibile
      - Non c'è cmeDirective
      - Il timestamp è lo stesso dell'ultima iniezione (dedup, salvo --no-dedup)
    """
    if not os.path.exists(DAEMON_REPORT_FILE):
        log("[DIRECTIVE] daemon-report.json non trovato — skip")
        return None

    try:
        with open(DAEMON_REPORT_FILE, "r", encoding="utf-8") as f:
            report = json.load(f)
    except Exception as e:
        log(f"[DIRECTIVE] Errore lettura daemon-report.json: {e}")
        return None

    report_ts = report.get("timestamp")
    directive = report.get("cmeDirective")

    if not report_ts or not directive:
        log("[DIRECTIVE] Nessuna cmeDirective nel report — skip")
        return None

    # Deduplicazione: stessa direttiva già iniettata?
    if not skip_dedup and report_ts == state.last_directive_ts:
        log(f"[DIRECTIVE] Timestamp invariato ({report_ts}) — skip (dedup)")
        return None

    # Nuova direttiva — formatta e aggiorna timestamp
    msg = format_directive(report_ts, directive)
    state.last_directive_ts = report_ts
    log(f"[DIRECTIVE] Nuova direttiva caricata (modo: {directive.get('mode', '?')}, ts: {report_ts})")
    return msg


# ─── Window Management ──────────────────────────────────────────────────────

def list_candidate_windows(show_all: bool = False):
    """Elenca tutte le finestre candidate (per debug)"""
    try:
        import pygetwindow as gw
        candidates = []
        for w in gw.getAllWindows():
            title = w.title.strip()
            if not title:
                continue
            if show_all:
                candidates.append(title)
            else:
                lower = title.lower()
                if any(k in lower for k in ["claude", "terminal", "powershell", "cmd", "controlla", "code", "mintty", "bash", "git", "chrome", "firefox", "edge", "brave", "opera", "lexmea", "localhost"]):
                    candidates.append(title)
        return candidates
    except Exception:
        return []


def get_window_process_name(window) -> str:
    """
    Ritorna il nome del processo (es. 'windowsterminal.exe') di una finestra.
    Solo Windows. Su errore ritorna stringa vuota.
    """
    if sys.platform != "win32":
        return ""
    try:
        import ctypes
        import ctypes.wintypes

        hwnd = window._hWnd
        pid = ctypes.wintypes.DWORD()
        ctypes.windll.user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value
        )
        if not handle:
            return ""

        buf = ctypes.create_unicode_buffer(260)
        size = ctypes.wintypes.DWORD(260)
        ctypes.windll.kernel32.QueryFullProcessImageNameW(
            handle, 0, buf, ctypes.byref(size)
        )
        ctypes.windll.kernel32.CloseHandle(handle)
        return os.path.basename(buf.value).lower()
    except Exception:
        return ""


def is_valid_target_window(window) -> bool:
    """
    Verifica che la finestra sia un browser (Claude Code gira nel browser).
    Rifiuta explorer.exe, terminali, editor — mai incollare lì.
    """
    proc = get_window_process_name(window)
    if not proc:
        log(f"[WINDOW] Processo non determinabile per \"{window.title}\" — SKIP (safety)")
        return False
    if proc in BLOCKED_PROCESSES:
        log(f"[WINDOW] BLOCCATA: \"{window.title}\" (processo: {proc})")
        return False
    if proc in ALLOWED_PROCESSES:
        return True
    # Processo sconosciuto — accetta solo se il titolo ha indicatore browser/claude
    title_lower = window.title.lower()
    browser_hints = ["claude", "chrome", "edge", "firefox", "brave", "opera"]
    if any(hint in title_lower for hint in browser_hints):
        log(f"[WINDOW] Processo '{proc}' sconosciuto ma titolo ha indicatore browser — ACCETTO")
        return True
    log(f"[WINDOW] Processo '{proc}' non riconosciuto come browser — SKIP")
    return False


def find_claude_window():
    """
    Trova la finestra Claude Code corretta.

    SAFETY: Verifica SEMPRE che la finestra sia un browser (Claude Code gira nel browser).
    Non incolla MAI in Explorer, terminali, editor — per evitare che
    Enter lanci file/BAT nella cartella del progetto.
    """
    try:
        import pygetwindow as gw

        all_windows = gw.getAllWindows()

        # Se c'è un target specifico, filtra su titolo + processo terminale
        if TARGET_WINDOW:
            target_lower = TARGET_WINDOW.lower()
            title_matches = [w for w in all_windows if target_lower in w.title.lower() and w.title.strip()]

            if not title_matches:
                candidates = list_candidate_windows()
                log(f"[ERROR] Nessuna finestra con '{TARGET_WINDOW}' nel titolo.")
                if candidates:
                    log(f"[DEBUG] Finestre candidate: {candidates[:8]}")
                return None

            # Filtra: accetta SOLO processi browser
            browser_matches = [w for w in title_matches if is_valid_target_window(w)]

            if browser_matches:
                chosen = browser_matches[0]
                proc = get_window_process_name(chosen)
                log(f"[WINDOW] Target '{TARGET_WINDOW}' → \"{chosen.title}\" (processo: {proc})")
                return chosen
            else:
                log(f"[ERROR] {len(title_matches)} finestre con '{TARGET_WINDOW}' nel titolo, ma NESSUNA è un browser.")
                for w in title_matches:
                    proc = get_window_process_name(w)
                    log(f"  SCARTATA: \"{w.title}\" (processo: {proc})")
                return None

        # Fallback senza target: cerca finestre con "Claude" nel titolo + check browser
        for title_part in ["Claude Code", "claude", "CLAUDE"]:
            wins = [w for w in all_windows if title_part.lower() in w.title.lower()]
            browser_wins = [w for w in wins if is_valid_target_window(w)]
            if browser_wins:
                chosen = browser_wins[0]
                log(f"[WINDOW] Trovata via '{title_part}': \"{chosen.title}\"")
                return chosen

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

def run_daemon(interval_min: int, message_override: str | None, once: bool = False, no_dedup: bool = False):
    """Loop principale del daemon.

    Se message_override è impostato (--message), usa quello come messaggio statico.
    Altrimenti carica la direttiva da daemon-report.json (data-driven).
    """
    mode_label = "STATIC (--message)" if message_override else "DATA-DRIVEN (daemon-report.json)"

    log("=" * 60)
    log("  GUI Daemon per Claude Code")
    log(f"  Intervallo: ogni {interval_min} minuti")
    log(f"  Modalità: {mode_label}")
    if no_dedup:
        log("  Dedup: DISABILITATA (--no-dedup)")
    log("")
    log("  COMANDI:")
    log("  ------------------------------------------------")
    log("   F9         Pausa / Riprendi")
    log("   F10        Esegui subito (skip timer)")
    log("   Ctrl+F10   Esci dal daemon")
    log("  ------------------------------------------------")
    log("=" * 60)

    # Setup hotkeys
    listener = setup_hotkeys()

    # Prima esecuzione — determina messaggio
    if message_override:
        msg = message_override
    else:
        msg = load_directive(skip_dedup=no_dedup)

    if msg:
        log(f"[RUN] Esecuzione #{state.total_runs + 1}")
        success = send_message(msg)
        state.total_runs += 1
        state.last_run = datetime.datetime.now().isoformat()
        save_state()
        save_log(msg, success)

        if success:
            log("[OK] Messaggio inviato con successo")
        else:
            log("[FAIL] Invio messaggio fallito")
    else:
        log("[SKIP] Nessuna nuova direttiva da iniettare")
        save_state()

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

        # Determina messaggio per questo ciclo
        if message_override:
            msg = message_override
        else:
            msg = load_directive(skip_dedup=no_dedup)

        if msg:
            log(f"[RUN] Esecuzione #{state.total_runs + 1}")
            success = send_message(msg)
            state.total_runs += 1
            state.last_run = datetime.datetime.now().isoformat()
            save_state()
            save_log(msg, success)

            if success:
                log("[OK] Messaggio inviato")
            else:
                log("[FAIL] Invio fallito")
        else:
            log("[SKIP] Nessuna nuova direttiva — ciclo saltato")

        log(f"[WAIT] Prossima esecuzione tra {interval_min} minuti...")

    log("[EXIT] GUI Daemon terminato.")
    listener.stop()

# ─── Entry Point ─────────────────────────────────────────────────────────────

def main():
    global TARGET_WINDOW

    parser = argparse.ArgumentParser(description="GUI Daemon per Claude Code")
    parser.add_argument("--interval", type=int, default=DEFAULT_INTERVAL_MIN,
                        help=f"Intervallo in minuti (default: {DEFAULT_INTERVAL_MIN})")
    parser.add_argument("--message", type=str, default=None,
                        help="Messaggio statico (override direttiva daemon)")
    parser.add_argument("--once", action="store_true",
                        help="Esegui una volta e esci")
    parser.add_argument("--no-dedup", action="store_true",
                        help="Disabilita deduplicazione timestamp (inietta sempre, per test)")
    parser.add_argument("--target", type=str, default=None,
                        help="Substring del TITOLO finestra (non URL). Es. 'LexMea', 'Claude', 'controlla-me'. Usa --list-all-windows per vedere i titoli.")
    parser.add_argument("--list-windows", action="store_true",
                        help="Mostra finestre candidate ed esci (per debug)")
    parser.add_argument("--list-all-windows", action="store_true",
                        help="Mostra TUTTE le finestre aperte (debug completo)")

    args = parser.parse_args()

    # --list-windows: mostra finestre e esci
    if args.list_windows or args.list_all_windows:
        show_all = args.list_all_windows
        label = "TUTTE le finestre" if show_all else "Finestre candidate"
        log(f"{label}:")
        candidates = list_candidate_windows(show_all=show_all)
        if candidates:
            for i, title in enumerate(candidates):
                log(f"  [{i}] {title}")
            log(f"\nUsa --target \"<substring>\" per matchare la finestra giusta.")
        else:
            log("  Nessuna finestra trovata.")
        return

    # Imposta target finestra
    if args.target:
        TARGET_WINDOW = args.target
        log(f"[CONFIG] Target finestra: '{TARGET_WINDOW}'")

    try:
        run_daemon(args.interval, args.message, args.once, args.no_dedup)
    except KeyboardInterrupt:
        log("\n[EXIT] Interrotto da Ctrl+C")
        save_state()

if __name__ == "__main__":
    main()
