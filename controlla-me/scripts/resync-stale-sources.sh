#!/bin/bash
# resync-stale-sources.sh — Re-sync delle fonti con ultimo sync al 2026-02-26.
#
# Task: bcf7902b (Data Engineering)
# Created: 2026-03-14
#
# Queste 7 fonti risultano stale (ultimo sync: 26 febbraio 2026).
# Lo script esegue un delta update per ciascuna, usando il Data Connector CLI.
#
# ────────────────────────────────────────────────────────────────────────────
# FONTI DA RI-SINCRONIZZARE:
#
#   ID                     Short Name          Tipo         Articoli stimati
#   ─────────────────────  ──────────────────  ──────────── ────────────────
#   codice_penale          c.p.                Normattiva   ~767
#   codice_consumo         Cod. Consumo        Normattiva   ~240
#   codice_proc_civile     c.p.c.              Normattiva   ~887
#   dlgs_231_2001          D.Lgs. 231/2001     Normattiva   ~109
#   dlgs_122_2005          D.Lgs. 122/2005     Normattiva   ~19
#   tu_edilizia            DPR 380/2001        Normattiva   ~151
#   gdpr                   GDPR                EUR-Lex      ~99
#
# ────────────────────────────────────────────────────────────────────────────
#
# Prerequisiti:
#   - .env.local configurato con SUPABASE_SERVICE_ROLE_KEY e VOYAGE_API_KEY
#   - Accesso rete a dati.normattiva.it e eur-lex.europa.eu
#   - Node.js 18+ e npx disponibile nel PATH
#
# Uso:
#   ./scripts/resync-stale-sources.sh              # Delta update (solo modifiche)
#   ./scripts/resync-stale-sources.sh --full        # Full re-sync (ri-scarica tutto)
#   ./scripts/resync-stale-sources.sh --dry         # Dry run (parse senza scrivere DB)
#   ./scripts/resync-stale-sources.sh --status      # Mostra stato e storico sync
#   ./scripts/resync-stale-sources.sh --single <id> # Sync singola fonte
#
# Comportamento atteso:
#   - Delta update: il connector scarica solo articoli modificati dopo l'ultimo sync.
#     Per Normattiva: confronta con dati gia in DB, inserisce nuovi/aggiorna modificati.
#     Per EUR-Lex: ri-fetcha l'HTML e confronta con versione in DB.
#   - Full re-sync: ri-esegue pipeline CONNECT -> MODEL -> LOAD su tutti gli articoli.
#     Articoli esistenti vengono aggiornati (upsert), non duplicati.
#   - Embeddings: generati via Voyage AI (voyage-law-2) per ogni articolo nuovo/aggiornato.
#     Se VOYAGE_API_KEY non configurata, embeddings saltati (articoli caricati lo stesso).
#
# Tempi stimati (indicativi):
#   - Delta update: ~2-5 min per fonte (dipende da quanti articoli sono cambiati)
#   - Full re-sync: ~10-30 min per fonte (fetch + parse + embeddings)
#   - GDPR (EUR-Lex): ~3 min (99 articoli, singolo HTML)
#   - Codice Penale: ~15 min full (767 articoli AKN)
#   - Codice Proc. Civile: ~20 min full (887 articoli AKN)

set -euo pipefail

# ─── Config ───

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
CLI="npx tsx scripts/data-connector.ts"
LOG_DIR="$PROJECT_DIR/logs/resync"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
LOG_FILE="$LOG_DIR/resync_${TIMESTAMP}.log"

# Le 7 fonti stale (ultimo sync: 2026-02-26)
STALE_SOURCES=(
  "codice_penale"
  "codice_consumo"
  "codice_proc_civile"
  "dlgs_231_2001"
  "dlgs_122_2005"
  "tu_edilizia"
  "gdpr"
)

# ─── Parse args ───

MODE="update"       # default: delta update
DRY_RUN=""
SINGLE_SOURCE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full)
      MODE="pipeline"
      shift
      ;;
    --dry)
      DRY_RUN="--dry"
      shift
      ;;
    --status)
      MODE="status"
      shift
      ;;
    --single)
      SINGLE_SOURCE="$2"
      shift 2
      ;;
    --help|-h)
      head -50 "$0" | tail -45
      exit 0
      ;;
    *)
      echo "Opzione sconosciuta: $1"
      echo "Uso: $0 [--full] [--dry] [--status] [--single <source_id>]"
      exit 1
      ;;
  esac
done

# ─── Helpers ───

log() {
  local msg="[$(date +%H:%M:%S)] $1"
  echo "$msg"
  if [[ -f "$LOG_FILE" ]]; then
    echo "$msg" >> "$LOG_FILE"
  fi
}

ensure_log_dir() {
  mkdir -p "$LOG_DIR"
  touch "$LOG_FILE"
  log "Log file: $LOG_FILE"
}

# ─── Status mode ───

if [[ "$MODE" == "status" ]]; then
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║  STATO FONTI STALE (ultimo sync: 2026-02-26)                ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo ""

  # Mostra stato generale
  cd "$PROJECT_DIR"
  $CLI status

  echo ""
  echo "─── Storico sync per ciascuna fonte ───"
  echo ""

  for source_id in "${STALE_SOURCES[@]}"; do
    echo ">>> $source_id"
    $CLI history "$source_id"
    echo ""
  done

  exit 0
fi

# ─── Filtra fonti ───

if [[ -n "$SINGLE_SOURCE" ]]; then
  # Verifica che la fonte sia nella lista
  FOUND=0
  for s in "${STALE_SOURCES[@]}"; do
    if [[ "$s" == "$SINGLE_SOURCE" ]]; then
      FOUND=1
      break
    fi
  done

  if [[ $FOUND -eq 0 ]]; then
    echo "ATTENZIONE: '$SINGLE_SOURCE' non e' nella lista delle 7 fonti stale."
    echo "Fonti stale: ${STALE_SOURCES[*]}"
    echo ""
    echo "Procedo comunque? (y/N)"
    read -r confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo "Annullato."
      exit 0
    fi
  fi

  SOURCES=("$SINGLE_SOURCE")
else
  SOURCES=("${STALE_SOURCES[@]}")
fi

# ─── Main ───

ensure_log_dir
cd "$PROJECT_DIR"

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  RE-SYNC FONTI STALE — $(date +%Y-%m-%d)                        ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Modalita: ${MODE}${DRY_RUN:+ (DRY RUN)}                                          "
echo "║  Fonti: ${#SOURCES[@]}                                                   "
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

TOTAL=${#SOURCES[@]}
SUCCESS=0
FAILED=0
SKIPPED=0
RESULTS=()

for i in "${!SOURCES[@]}"; do
  source_id="${SOURCES[$i]}"
  idx=$((i + 1))

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  log "[$idx/$TOTAL] $source_id — Inizio $MODE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  START_TIME=$(date +%s)

  if [[ "$MODE" == "update" ]]; then
    # Delta update
    if $CLI update "$source_id" 2>&1 | tee -a "$LOG_FILE"; then
      END_TIME=$(date +%s)
      DURATION=$((END_TIME - START_TIME))
      log "[$idx/$TOTAL] $source_id — Completato in ${DURATION}s"
      SUCCESS=$((SUCCESS + 1))
      RESULTS+=("OK  ${DURATION}s  $source_id")
    else
      END_TIME=$(date +%s)
      DURATION=$((END_TIME - START_TIME))
      log "[$idx/$TOTAL] $source_id — FALLITO dopo ${DURATION}s"
      FAILED=$((FAILED + 1))
      RESULTS+=("ERR ${DURATION}s  $source_id")
    fi
  elif [[ "$MODE" == "pipeline" ]]; then
    # Full re-sync
    if $CLI pipeline "$source_id" $DRY_RUN 2>&1 | tee -a "$LOG_FILE"; then
      END_TIME=$(date +%s)
      DURATION=$((END_TIME - START_TIME))
      log "[$idx/$TOTAL] $source_id — Completato in ${DURATION}s"
      SUCCESS=$((SUCCESS + 1))
      RESULTS+=("OK  ${DURATION}s  $source_id")
    else
      END_TIME=$(date +%s)
      DURATION=$((END_TIME - START_TIME))
      log "[$idx/$TOTAL] $source_id — FALLITO dopo ${DURATION}s"
      FAILED=$((FAILED + 1))
      RESULTS+=("ERR ${DURATION}s  $source_id")
    fi
  fi
done

# ─── Riepilogo ───

echo ""
echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║  RIEPILOGO RE-SYNC                                          ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  Totale:    $TOTAL                                               "
echo "║  Successo:  $SUCCESS                                               "
echo "║  Falliti:   $FAILED                                               "
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Dettaglio:"
for r in "${RESULTS[@]}"; do
  echo "    $r"
done
echo ""
echo "  Log: $LOG_FILE"
echo ""

# Exit code: fallito se almeno una fonte ha avuto errori
if [[ $FAILED -gt 0 ]]; then
  exit 1
fi
