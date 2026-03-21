#!/usr/bin/env bash
# =============================================================================
# mobile-session.sh — Sessione tmux persistente per Claude Code via SSH mobile
# =============================================================================
#
# PROBLEMA: Quando il telefono si blocca, la sessione SSH muore e uccide
#           il processo Claude Code. tmux mantiene la sessione viva.
#
# USO:
#   Da mobile SSH (prima volta o riconnessione):
#     bash scripts/mobile-session.sh
#
#   Per staccarsi SENZA uccidere la sessione:
#     Ctrl+B poi D    (detach)
#
#   Per riconnettersi manualmente:
#     tmux attach -t claude
#
#   Per vedere sessioni attive:
#     tmux ls
#
#   Per uccidere la sessione:
#     tmux kill-session -t claude
#
# =============================================================================

SESSION_NAME="claude"

# Controlla che tmux sia disponibile
if ! command -v tmux &>/dev/null; then
    echo "ERRORE: tmux non installato. Installa con: sudo apt install tmux"
    exit 1
fi

# Se siamo gia dentro tmux, avvisa e esci
if [ -n "$TMUX" ]; then
    echo "Sei gia dentro una sessione tmux ($(tmux display-message -p '#S'))."
    echo "Usa 'Ctrl+B d' per staccarti, poi riesegui questo script."
    exit 0
fi

# Controlla se la sessione esiste gia
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Sessione '$SESSION_NAME' trovata. Riconnessione..."
    exec tmux attach -t "$SESSION_NAME"
else
    echo "Creo nuova sessione '$SESSION_NAME' con Claude Code..."
    exec tmux new-session -s "$SESSION_NAME" "claude"
fi
