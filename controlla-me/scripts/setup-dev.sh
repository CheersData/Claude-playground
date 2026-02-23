#!/bin/bash
# ============================================================
# controlla.me — Setup ambiente di sviluppo da zero
# ============================================================
# Esegui con: curl -sL <URL_RAW_GITHUB> | bash
# Oppure copia e incolla blocchi nel terminale.
#
# Testato su macOS. Per Linux/Windows vedi note in fondo.
# ============================================================

set -e  # Esci al primo errore

echo ""
echo "============================================================"
echo "  controlla.me — Setup ambiente di sviluppo"
echo "============================================================"
echo ""

# ─── 1. Homebrew (package manager macOS) ───
if ! command -v brew &>/dev/null; then
  echo ">>> Installo Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Aggiungi brew al PATH (Apple Silicon)
  if [[ -f /opt/homebrew/bin/brew ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
  fi
else
  echo ">>> Homebrew gia installato"
fi

# ─── 2. Git ───
if ! command -v git &>/dev/null; then
  echo ">>> Installo Git..."
  brew install git
else
  echo ">>> Git gia installato ($(git --version))"
fi

# ─── 3. Node.js via fnm (Fast Node Manager) ───
if ! command -v fnm &>/dev/null; then
  echo ">>> Installo fnm (Node version manager)..."
  brew install fnm
  # Configura fnm nella shell
  echo 'eval "$(fnm env --use-on-cd --shell zsh)"' >> ~/.zshrc
  eval "$(fnm env --use-on-cd --shell zsh)"
else
  echo ">>> fnm gia installato"
fi

NODE_VERSION="22"
echo ">>> Installo Node.js v${NODE_VERSION}..."
fnm install "$NODE_VERSION"
fnm use "$NODE_VERSION"
fnm default "$NODE_VERSION"
echo ">>> Node $(node -v), npm $(npm -v)"

# ─── 4. Clone repo ───
REPO_DIR="$HOME/Projects/Claude-playground"
REPO_URL="https://github.com/CheersData/Claude-playground.git"
BRANCH="claude/resume-data-loading-fh1xc"

if [ ! -d "$REPO_DIR" ]; then
  echo ">>> Clono repository..."
  mkdir -p "$HOME/Projects"
  git clone "$REPO_URL" "$REPO_DIR"
else
  echo ">>> Repository gia presente in $REPO_DIR"
fi

cd "$REPO_DIR"
echo ">>> Checkout branch $BRANCH..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull origin "$BRANCH"

# ─── 5. Installa dipendenze ───
cd "$REPO_DIR/controlla-me"
echo ">>> Installo dipendenze npm..."
npm install

# ─── 6. Crea .env.local ───
ENV_FILE="$REPO_DIR/controlla-me/.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo ">>> Configuro variabili d'ambiente (.env.local)"
  echo ">>> Trovi le chiavi nel dashboard Supabase: Settings > API"
  echo ""

  read -p "NEXT_PUBLIC_SUPABASE_URL: " SUPABASE_URL
  read -p "NEXT_PUBLIC_SUPABASE_ANON_KEY: " SUPABASE_ANON
  read -sp "SUPABASE_SERVICE_ROLE_KEY: " SUPABASE_SECRET
  echo ""
  read -sp "VOYAGE_API_KEY (opzionale, premi Invio per saltare): " VOYAGE_KEY
  echo ""

  cat > "$ENV_FILE" <<ENVEOF
NEXT_PUBLIC_SUPABASE_URL=${SUPABASE_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${SUPABASE_ANON}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SECRET}
VOYAGE_API_KEY=${VOYAGE_KEY}
ENVEOF
  echo ">>> .env.local creato"
else
  echo ">>> .env.local gia presente"
fi

# ─── 7. Seed corpus (carica dati giuridici) ───
echo ""
echo ">>> Carico corpus giuridico nel DB (ci vogliono ~5-10 minuti)..."
echo ">>> Normattiva: via Akoma Ntoso XML API"
echo ">>> EUR-Lex: via HTML parser"
echo ""
npx tsx scripts/seed-corpus.ts --force all

# ─── 8. Verifica dati ───
echo ""
echo ">>> Verifico qualita dati..."
npx tsx scripts/check-data.ts

# ─── 9. Done! ───
echo ""
echo "============================================================"
echo "  SETUP COMPLETATO!"
echo "============================================================"
echo ""
echo "  Per avviare il server di sviluppo:"
echo "    cd $REPO_DIR/controlla-me"
echo "    npm run dev"
echo ""
echo "  Apri: http://localhost:3000"
echo ""
echo "  Altri comandi utili:"
echo "    npm run build      # Build di produzione"
echo "    npm run test       # Esegui test"
echo "    npm run lint       # Linting"
echo ""
echo "============================================================"
