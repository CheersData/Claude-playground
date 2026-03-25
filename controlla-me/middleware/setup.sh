#!/usr/bin/env bash
#
# setup.sh -- Setup script per il progetto Middleware C# (.NET 8)
#
# Questo script:
#   1. Verifica se .NET 8 SDK e' installato; se assente, lo scarica e installa in $HOME/.dotnet
#   2. Aggiunge $HOME/.dotnet al PATH per la sessione corrente
#   3. Esegue dotnet restore (scarica dipendenze NuGet)
#   4. Esegue dotnet build (compila il progetto)
#   5. Esegue dotnet test (lancia i test xUnit)
#   6. Stampa un sommario dei risultati
#
# Uso:
#   chmod +x middleware/setup.sh
#   ./middleware/setup.sh
#

set -euo pipefail

# --------------------------------------------------------------------------
# Costanti
# --------------------------------------------------------------------------
DOTNET_VERSION_MAJOR="8"
DOTNET_INSTALL_DIR="$HOME/.dotnet"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOLUTION_FILE="$SCRIPT_DIR/Middleware.sln"

# Colori per output (disabilitati se non e' un terminale)
if [ -t 1 ]; then
    GREEN='\033[0;32m'
    RED='\033[0;31m'
    YELLOW='\033[1;33m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    RESET='\033[0m'
else
    GREEN='' RED='' YELLOW='' CYAN='' BOLD='' RESET=''
fi

# --------------------------------------------------------------------------
# Funzioni helper
# --------------------------------------------------------------------------

info()    { echo -e "${CYAN}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
fail()    { echo -e "${RED}[FAIL]${RESET}  $*"; exit 1; }

# Stampa un separatore visivo
separator() {
    echo -e "${BOLD}──────────────────────────────────────────────────${RESET}"
}

# Controlla se un comando esiste nel PATH
command_exists() {
    command -v "$1" &>/dev/null
}

# --------------------------------------------------------------------------
# Step 0: Verifica prerequisiti
# --------------------------------------------------------------------------

separator
info "Middleware C# Setup Script"
info "Directory progetto: $SCRIPT_DIR"
separator
echo ""

# Verifica che il file solution esista
if [ ! -f "$SOLUTION_FILE" ]; then
    fail "File solution non trovato: $SOLUTION_FILE"
fi

# --------------------------------------------------------------------------
# Step 1: Verifica/Installa .NET 8 SDK
# --------------------------------------------------------------------------

info "Step 1/5: Verifica .NET ${DOTNET_VERSION_MAJOR} SDK..."

# Aggiunge $HOME/.dotnet al PATH se esiste (potrebbe essere una installazione precedente)
if [ -d "$DOTNET_INSTALL_DIR" ]; then
    export PATH="$DOTNET_INSTALL_DIR:$DOTNET_INSTALL_DIR/tools:$PATH"
    export DOTNET_ROOT="$DOTNET_INSTALL_DIR"
fi

DOTNET_FOUND=false
DOTNET_SDK_VERSION=""

if command_exists dotnet; then
    # Controlla se c'e' un SDK versione 8.x installato
    DOTNET_SDK_VERSION=$(dotnet --list-sdks 2>/dev/null | grep "^${DOTNET_VERSION_MAJOR}\." | tail -1 | awk '{print $1}' || true)
    if [ -n "$DOTNET_SDK_VERSION" ]; then
        DOTNET_FOUND=true
        success ".NET SDK $DOTNET_SDK_VERSION trovato"
    else
        warn ".NET trovato ma nessun SDK versione ${DOTNET_VERSION_MAJOR}.x installato"
    fi
else
    warn "Comando 'dotnet' non trovato nel PATH"
fi

if [ "$DOTNET_FOUND" = false ]; then
    info "Installazione .NET ${DOTNET_VERSION_MAJOR} SDK in $DOTNET_INSTALL_DIR..."

    # Scarica lo script di installazione ufficiale Microsoft se non gia' presente
    INSTALL_SCRIPT="$SCRIPT_DIR/dotnet-install.sh"
    if [ ! -f "$INSTALL_SCRIPT" ]; then
        info "Download dotnet-install.sh da Microsoft..."
        if command_exists curl; then
            curl -fsSL https://dot.net/v1/dotnet-install.sh -o "$INSTALL_SCRIPT"
        elif command_exists wget; then
            wget -qO "$INSTALL_SCRIPT" https://dot.net/v1/dotnet-install.sh
        else
            fail "Serve curl o wget per scaricare l'installer .NET. Installa uno dei due e riprova."
        fi
    fi

    chmod +x "$INSTALL_SCRIPT"

    # Esegui l'installer: installa l'ultimo SDK .NET 8 in $HOME/.dotnet
    if ! bash "$INSTALL_SCRIPT" --channel "${DOTNET_VERSION_MAJOR}.0" --install-dir "$DOTNET_INSTALL_DIR"; then
        fail "Installazione .NET SDK fallita. Controlla la connessione internet e riprova."
    fi

    # Aggiungi al PATH
    export PATH="$DOTNET_INSTALL_DIR:$DOTNET_INSTALL_DIR/tools:$PATH"
    export DOTNET_ROOT="$DOTNET_INSTALL_DIR"

    # Verifica installazione
    if ! command_exists dotnet; then
        fail "dotnet non trovato dopo l'installazione in $DOTNET_INSTALL_DIR"
    fi

    DOTNET_SDK_VERSION=$(dotnet --list-sdks 2>/dev/null | grep "^${DOTNET_VERSION_MAJOR}\." | tail -1 | awk '{print $1}' || true)
    if [ -z "$DOTNET_SDK_VERSION" ]; then
        fail ".NET SDK ${DOTNET_VERSION_MAJOR}.x non risulta installato dopo il setup"
    fi

    success ".NET SDK $DOTNET_SDK_VERSION installato in $DOTNET_INSTALL_DIR"

    # Suggerimento per rendere permanente il PATH
    echo ""
    warn "Per rendere permanente l'aggiunta al PATH, aggiungi queste righe al tuo ~/.bashrc o ~/.zshrc:"
    echo ""
    echo "    export DOTNET_ROOT=\"$DOTNET_INSTALL_DIR\""
    echo "    export PATH=\"\$DOTNET_ROOT:\$DOTNET_ROOT/tools:\$PATH\""
    echo ""
fi

# --------------------------------------------------------------------------
# Step 2: Aggiorna PATH (conferma)
# --------------------------------------------------------------------------

info "Step 2/5: Verifica PATH..."

DOTNET_PATH=$(command -v dotnet)
success "dotnet disponibile: $DOTNET_PATH"

# Disabilita telemetria .NET per evitare output indesiderato
export DOTNET_CLI_TELEMETRY_OPTOUT=1
# Disabilita messaggi di benvenuto
export DOTNET_NOLOGO=1

echo ""

# --------------------------------------------------------------------------
# Step 3: dotnet restore
# --------------------------------------------------------------------------

separator
info "Step 3/5: Restore dipendenze NuGet..."

RESTORE_START=$(date +%s)

if dotnet restore "$SOLUTION_FILE" --verbosity quiet; then
    RESTORE_END=$(date +%s)
    RESTORE_DURATION=$((RESTORE_END - RESTORE_START))
    success "Restore completato in ${RESTORE_DURATION}s"
else
    fail "dotnet restore fallito. Controlla i file .csproj e la connessione internet."
fi

echo ""

# --------------------------------------------------------------------------
# Step 4: dotnet build
# --------------------------------------------------------------------------

separator
info "Step 4/5: Build del progetto..."

BUILD_START=$(date +%s)
BUILD_OUTPUT=$(mktemp)

if dotnet build "$SOLUTION_FILE" --configuration Release --no-restore --verbosity quiet 2>&1 | tee "$BUILD_OUTPUT"; then
    BUILD_END=$(date +%s)
    BUILD_DURATION=$((BUILD_END - BUILD_START))

    # Conta warnings e errori dall'output
    BUILD_WARNINGS=$(grep -c " warning " "$BUILD_OUTPUT" 2>/dev/null || echo "0")
    BUILD_ERRORS=$(grep -c " error " "$BUILD_OUTPUT" 2>/dev/null || echo "0")

    if [ "$BUILD_ERRORS" -gt 0 ]; then
        fail "Build completata con $BUILD_ERRORS errore/i"
    fi

    success "Build completata in ${BUILD_DURATION}s (warning: $BUILD_WARNINGS)"
else
    rm -f "$BUILD_OUTPUT"
    fail "dotnet build fallito. Controlla gli errori sopra."
fi

rm -f "$BUILD_OUTPUT"
echo ""

# --------------------------------------------------------------------------
# Step 5: dotnet test
# --------------------------------------------------------------------------

separator
info "Step 5/5: Esecuzione test..."

TEST_START=$(date +%s)
TEST_OUTPUT=$(mktemp)

# Esegui i test catturando l'output per il parsing dei risultati
if dotnet test "$SOLUTION_FILE" \
    --configuration Release \
    --no-build \
    --verbosity normal \
    --logger "console;verbosity=normal" \
    2>&1 | tee "$TEST_OUTPUT"; then
    TEST_EXIT_CODE=0
else
    TEST_EXIT_CODE=$?
fi

TEST_END=$(date +%s)
TEST_DURATION=$((TEST_END - TEST_START))

# Estrai risultati dai log (formato: "Passed: X, Failed: Y, Skipped: Z, Total: N")
TEST_PASSED=$(grep -oP 'Passed:\s*\K\d+' "$TEST_OUTPUT" 2>/dev/null | tail -1 || echo "?")
TEST_FAILED=$(grep -oP 'Failed:\s*\K\d+' "$TEST_OUTPUT" 2>/dev/null | tail -1 || echo "?")
TEST_SKIPPED=$(grep -oP 'Skipped:\s*\K\d+' "$TEST_OUTPUT" 2>/dev/null | tail -1 || echo "0")
TEST_TOTAL=$(grep -oP 'Total:\s*\K\d+' "$TEST_OUTPUT" 2>/dev/null | tail -1 || echo "?")

rm -f "$TEST_OUTPUT"

if [ "$TEST_EXIT_CODE" -ne 0 ]; then
    warn "Alcuni test sono falliti (exit code: $TEST_EXIT_CODE)"
    TEST_STATUS="FAILED"
else
    success "Test completati in ${TEST_DURATION}s"
    TEST_STATUS="PASSED"
fi

echo ""

# --------------------------------------------------------------------------
# Sommario
# --------------------------------------------------------------------------

separator
echo ""
echo -e "${BOLD}                    SOMMARIO SETUP${RESET}"
echo ""
separator

printf "  %-24s %s\n" ".NET SDK:" "$DOTNET_SDK_VERSION"
printf "  %-24s %s\n" "Installazione:" "$DOTNET_INSTALL_DIR"
printf "  %-24s %s\n" "Solution:" "$SOLUTION_FILE"
echo ""

printf "  %-24s %s\n" "Restore:" "OK (${RESTORE_DURATION}s)"
printf "  %-24s %s\n" "Build (Release):" "OK (${BUILD_DURATION}s, warning: $BUILD_WARNINGS)"

if [ "$TEST_STATUS" = "PASSED" ]; then
    echo -e "  $(printf '%-24s' 'Test:') ${GREEN}PASSED${RESET} (${TEST_DURATION}s)"
else
    echo -e "  $(printf '%-24s' 'Test:') ${RED}FAILED${RESET} (${TEST_DURATION}s)"
fi

printf "  %-24s %s\n" "  Passed:" "$TEST_PASSED"
printf "  %-24s %s\n" "  Failed:" "$TEST_FAILED"
printf "  %-24s %s\n" "  Skipped:" "$TEST_SKIPPED"
printf "  %-24s %s\n" "  Total:" "$TEST_TOTAL"

echo ""
separator

if [ "$TEST_STATUS" = "PASSED" ]; then
    echo ""
    success "Setup completato con successo!"
    echo ""
    info "Per avviare il server:"
    echo "    cd $SCRIPT_DIR"
    echo "    dotnet run --project src/Middleware.Api"
    echo ""
    info "Il server sara' disponibile su http://localhost:5000"
    echo ""
else
    echo ""
    warn "Setup completato con errori nei test. Correggi i test falliti prima di procedere."
    echo ""
    exit 1
fi
