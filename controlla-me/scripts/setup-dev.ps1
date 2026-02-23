#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Setup completo per controlla.me su Windows pulito.

.DESCRIPTION
    Installa tutto il necessario e configura l'ambiente di sviluppo:
    1. Git (via winget)
    2. fnm + Node.js 22
    3. Clona il repository
    4. npm install
    5. Crea .env.local con le chiavi
    6. Carica il corpus legislativo (~5-10 min)
    7. Verifica i dati
    8. Istruzioni per avviare

.USAGE
    Apri PowerShell come Amministratore e lancia:
    Set-ExecutionPolicy Bypass -Scope Process -Force; irm https://raw.githubusercontent.com/CheersData/Claude-playground/master/controlla-me/scripts/setup-dev.ps1 | iex
#>

$ErrorActionPreference = "Stop"

# ─── Colori e helpers ───

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host ""
    Write-Host "  [$Step] " -ForegroundColor Cyan -NoNewline
    Write-Host $Message -ForegroundColor White
    Write-Host ""
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  [!] $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "  [ERRORE] $Message" -ForegroundColor Red
}

function Test-CommandExists {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# ─── Banner ───

Clear-Host
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host "                                                              " -ForegroundColor Cyan
Write-Host "     controlla.me - Setup Ambiente di Sviluppo Windows        " -ForegroundColor White
Write-Host "                                                              " -ForegroundColor Cyan
Write-Host "     Questo script installa e configura tutto il necessario   " -ForegroundColor Gray
Write-Host "     per sviluppare controlla.me su un PC Windows pulito.     " -ForegroundColor Gray
Write-Host "                                                              " -ForegroundColor Cyan
Write-Host "  ============================================================" -ForegroundColor Cyan
Write-Host ""

# ─── Directory di lavoro ───

$REPO_DIR = "$env:USERPROFILE\Claude-playground"
$PROJECT_DIR = "$REPO_DIR\controlla-me"

# ─── Step 1: Git ───

Write-Step "1/7" "Installazione Git"

if (Test-CommandExists "git") {
    $gitVersion = git --version
    Write-Ok "Git gia installato: $gitVersion"
} else {
    Write-Host "  Installazione Git tramite winget..." -ForegroundColor Gray
    try {
        winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
        # Aggiorna PATH per la sessione corrente
        $env:PATH = "$env:ProgramFiles\Git\cmd;$env:PATH"

        if (Test-CommandExists "git") {
            Write-Ok "Git installato con successo"
        } else {
            Write-Warn "Git installato ma potrebbe servire riavviare PowerShell"
            Write-Host "  Provo ad aggiungerlo al PATH..." -ForegroundColor Gray
            $env:PATH = "${env:ProgramFiles}\Git\cmd;${env:LocalAppData}\Programs\Git\cmd;$env:PATH"
        }
    }
    catch {
        Write-Err "Impossibile installare Git. Installalo manualmente da https://git-scm.com"
        exit 1
    }
}

# ─── Step 2: fnm + Node.js 22 ───

Write-Step "2/7" "Installazione fnm e Node.js 22"

if (Test-CommandExists "fnm") {
    Write-Ok "fnm gia installato"
} else {
    Write-Host "  Installazione fnm (Fast Node Manager)..." -ForegroundColor Gray
    try {
        winget install Schniz.fnm -e --accept-source-agreements --accept-package-agreements
        # Configura fnm per la sessione corrente
        $env:PATH = "$env:LOCALAPPDATA\fnm;$env:PATH"
        $env:FNM_DIR = "$env:LOCALAPPDATA\fnm"
    }
    catch {
        Write-Err "Impossibile installare fnm. Installalo manualmente: winget install Schniz.fnm"
        exit 1
    }
}

# Configura fnm per questa sessione PowerShell
try {
    fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
}
catch {
    Write-Warn "fnm env fallito, provo configurazione manuale..."
    $env:PATH = "$env:LOCALAPPDATA\fnm;$env:PATH"
}

# Installa Node.js 22
if (Test-CommandExists "node") {
    $nodeVersion = node --version
    if ($nodeVersion -match "^v22") {
        Write-Ok "Node.js $nodeVersion gia installato"
    } else {
        Write-Host "  Installazione Node.js 22 (attuale: $nodeVersion)..." -ForegroundColor Gray
        fnm install 22
        fnm use 22
        fnm default 22
        Write-Ok "Node.js $(node --version) installato"
    }
} else {
    Write-Host "  Installazione Node.js 22..." -ForegroundColor Gray
    fnm install 22
    fnm use 22
    fnm default 22
    Write-Ok "Node.js $(node --version) installato"
}

# Verifica npm
if (Test-CommandExists "npm") {
    Write-Ok "npm $(npm --version) disponibile"
} else {
    Write-Err "npm non trovato. Riavvia PowerShell e rilancia lo script."
    exit 1
}

# ─── Step 3: Clona il repository ───

Write-Step "3/7" "Clone del repository"

if (Test-Path "$REPO_DIR\.git") {
    Write-Ok "Repository gia presente in $REPO_DIR"
    Write-Host "  Aggiorno all'ultima versione..." -ForegroundColor Gray
    Push-Location $REPO_DIR
    git fetch origin master
    git checkout master
    git pull origin master
    Pop-Location
    Write-Ok "Repository aggiornato"
} else {
    Write-Host "  Clono il repository in $REPO_DIR..." -ForegroundColor Gray
    git clone https://github.com/CheersData/Claude-playground.git $REPO_DIR
    Write-Ok "Repository clonato in $REPO_DIR"
}

# Verifica che la cartella del progetto esista
if (-not (Test-Path "$PROJECT_DIR\package.json")) {
    Write-Err "Cartella controlla-me non trovata o package.json mancante!"
    exit 1
}

Write-Ok "Progetto controlla-me trovato"

# ─── Step 4: npm install ───

Write-Step "4/7" "Installazione dipendenze npm"

Push-Location $PROJECT_DIR
Write-Host "  Eseguo npm install (puo richiedere qualche minuto)..." -ForegroundColor Gray
npm install
Pop-Location

Write-Ok "Dipendenze installate"

# ─── Step 5: Configurazione .env.local ───

Write-Step "5/7" "Configurazione variabili d'ambiente"

$envFile = "$PROJECT_DIR\.env.local"

if (Test-Path $envFile) {
    Write-Warn "File .env.local gia esistente"
    $overwrite = Read-Host "  Vuoi sovrascriverlo? (s/N)"
    if ($overwrite -ne "s" -and $overwrite -ne "S") {
        Write-Ok "Mantengo .env.local esistente"
        $skipEnv = $true
    }
}

if (-not $skipEnv) {
    Write-Host ""
    Write-Host "  Ora ti chiedo le chiavi dal dashboard Supabase e le API key." -ForegroundColor White
    Write-Host "  Puoi trovarle su: https://supabase.com/dashboard" -ForegroundColor Gray
    Write-Host ""

    # Supabase
    $supabaseUrl = Read-Host "  SUPABASE URL (es. https://xxx.supabase.co)"
    $supabaseAnonKey = Read-Host "  SUPABASE ANON KEY"
    $supabaseServiceKey = Read-Host "  SUPABASE SERVICE ROLE KEY"

    # Anthropic
    Write-Host ""
    Write-Host "  Chiave API Anthropic: https://console.anthropic.com" -ForegroundColor Gray
    $anthropicKey = Read-Host "  ANTHROPIC API KEY"

    # Voyage AI
    Write-Host ""
    Write-Host "  Chiave Voyage AI: https://dash.voyageai.com" -ForegroundColor Gray
    $voyageKey = Read-Host "  VOYAGE API KEY"

    # Stripe (opzionale)
    Write-Host ""
    Write-Host "  Stripe e opzionale per lo sviluppo locale." -ForegroundColor Gray
    $stripeSecret = Read-Host "  STRIPE SECRET KEY (invio per saltare)"
    $stripeWebhook = ""
    $stripePub = ""
    $stripeProPrice = ""
    $stripeSinglePrice = ""
    if ($stripeSecret) {
        $stripeWebhook = Read-Host "  STRIPE WEBHOOK SECRET"
        $stripePub = Read-Host "  STRIPE PUBLISHABLE KEY"
        $stripeProPrice = Read-Host "  STRIPE PRO PRICE ID"
        $stripeSinglePrice = Read-Host "  STRIPE SINGLE PRICE ID"
    }

    # Scrivi .env.local
    $envContent = @"
# Supabase (Database + Auth)
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabaseAnonKey
SUPABASE_SERVICE_ROLE_KEY=$supabaseServiceKey

# Anthropic Claude API
ANTHROPIC_API_KEY=$anthropicKey

# Stripe Payments
STRIPE_SECRET_KEY=$stripeSecret
STRIPE_WEBHOOK_SECRET=$stripeWebhook
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$stripePub
STRIPE_PRO_PRICE_ID=$stripeProPrice
STRIPE_SINGLE_PRICE_ID=$stripeSinglePrice

# Voyage AI - embeddings per il vector DB legale
VOYAGE_API_KEY=$voyageKey

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000
"@

    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
    Write-Ok "File .env.local creato"
}

# ─── Step 6: Caricamento corpus legislativo ───

Write-Step "6/7" "Caricamento corpus legislativo italiano"

Write-Host "  Questo passaggio scarica il Codice Civile da HuggingFace," -ForegroundColor Gray
Write-Host "  genera gli embeddings con Voyage AI e li carica su Supabase." -ForegroundColor Gray
Write-Host "  Puo richiedere 5-10 minuti." -ForegroundColor Gray
Write-Host ""

$loadCorpus = Read-Host "  Vuoi caricare il corpus ora? (S/n)"

if ($loadCorpus -ne "n" -and $loadCorpus -ne "N") {
    Push-Location $REPO_DIR
    Write-Host "  Avvio seed-corpus.ts..." -ForegroundColor Gray
    npx tsx controlla-me/scripts/seed-corpus.ts
    Pop-Location
    Write-Ok "Corpus caricato!"
} else {
    Write-Warn "Corpus non caricato. Puoi farlo dopo con:"
    Write-Host "  cd $REPO_DIR && npx tsx controlla-me/scripts/seed-corpus.ts" -ForegroundColor Yellow
}

# ─── Step 7: Verifica finale ───

Write-Step "7/7" "Verifica finale"

$checks = @(
    @{ Name = "Git"; Check = { Test-CommandExists "git" } },
    @{ Name = "Node.js"; Check = { Test-CommandExists "node" } },
    @{ Name = "npm"; Check = { Test-CommandExists "npm" } },
    @{ Name = "Repository"; Check = { Test-Path "$REPO_DIR\.git" } },
    @{ Name = "package.json"; Check = { Test-Path "$PROJECT_DIR\package.json" } },
    @{ Name = "node_modules"; Check = { Test-Path "$PROJECT_DIR\node_modules" } },
    @{ Name = ".env.local"; Check = { Test-Path "$PROJECT_DIR\.env.local" } }
)

$allOk = $true
foreach ($check in $checks) {
    $result = & $check.Check
    if ($result) {
        Write-Ok "$($check.Name)"
    } else {
        Write-Err "$($check.Name) - MANCANTE"
        $allOk = $false
    }
}

# ─── Riepilogo finale ───

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Cyan

if ($allOk) {
    Write-Host ""
    Write-Host "     SETUP COMPLETATO CON SUCCESSO!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Per avviare il sito:" -ForegroundColor White
    Write-Host ""
    Write-Host "    cd $PROJECT_DIR" -ForegroundColor Yellow
    Write-Host "    npm run dev" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Poi apri nel browser:" -ForegroundColor White
    Write-Host "    http://localhost:3000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Oppure doppio click su:" -ForegroundColor White
    Write-Host "    $PROJECT_DIR\AVVIA_SITO.bat" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "     SETUP INCOMPLETO - Controlla gli errori sopra" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ============================================================" -ForegroundColor Cyan
}

Write-Host ""

# Configura fnm per PowerShell in modo permanente (aggiunge al profilo)
$profilePath = $PROFILE.CurrentUserCurrentHost
if (-not (Test-Path $profilePath)) {
    New-Item -Path $profilePath -ItemType File -Force | Out-Null
}

$fnmSetup = 'fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression'
$profileContent = ""
if (Test-Path $profilePath) {
    $profileContent = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
}

if (-not $profileContent -or -not $profileContent.Contains("fnm env")) {
    Add-Content -Path $profilePath -Value "`n# fnm (Node.js version manager)`n$fnmSetup"
    Write-Ok "fnm configurato nel profilo PowerShell"
    Write-Host "  ($profilePath)" -ForegroundColor Gray
}

Write-Host ""
