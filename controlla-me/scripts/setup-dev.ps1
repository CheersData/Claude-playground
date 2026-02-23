# ============================================================
# controlla.me — Setup ambiente di sviluppo (Windows)
# ============================================================
# Apri PowerShell come Amministratore ed esegui:
#   Set-ExecutionPolicy Bypass -Scope Process -Force
#   irm https://raw.githubusercontent.com/CheersData/Claude-playground/claude/resume-data-loading-fh1xc/controlla-me/scripts/setup-dev.ps1 | iex
#
# Oppure se hai gia clonato il repo:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-dev.ps1
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  controlla.me — Setup ambiente di sviluppo (Windows)"      -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ─── 1. Git ───
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host ">>> Installo Git..." -ForegroundColor Yellow
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    # Aggiungi Git al PATH della sessione corrente
    $env:Path = "$env:ProgramFiles\Git\cmd;" + $env:Path
} else {
    Write-Host ">>> Git gia installato ($(git --version))" -ForegroundColor Green
}

# ─── 2. Node.js via fnm ───
if (-not (Get-Command fnm -ErrorAction SilentlyContinue)) {
    Write-Host ">>> Installo fnm (Node version manager)..." -ForegroundColor Yellow
    winget install --id Schniz.fnm -e --accept-source-agreements --accept-package-agreements
    # Configura fnm nel profilo PowerShell
    $fnmPath = "$env:LOCALAPPDATA\fnm"
    if (Test-Path $fnmPath) {
        $env:Path = "$fnmPath;" + $env:Path
    }
    # Crea profilo PowerShell se non esiste
    if (-not (Test-Path $PROFILE)) {
        New-Item -Path $PROFILE -ItemType File -Force | Out-Null
    }
    $fnmInit = 'fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression'
    if (-not (Select-String -Path $PROFILE -Pattern "fnm env" -Quiet -ErrorAction SilentlyContinue)) {
        Add-Content -Path $PROFILE -Value "`n# fnm (Node version manager)`n$fnmInit"
        Write-Host ">>> Aggiunto fnm al profilo PowerShell" -ForegroundColor Green
    }
    # Attiva fnm nella sessione corrente
    fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
} else {
    Write-Host ">>> fnm gia installato" -ForegroundColor Green
}

$nodeVersion = "22"
Write-Host ">>> Installo Node.js v$nodeVersion..." -ForegroundColor Yellow
fnm install $nodeVersion
fnm use $nodeVersion
fnm default $nodeVersion
# Rigenera PATH con fnm
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
Write-Host ">>> Node $(node -v), npm $(npm -v)" -ForegroundColor Green

# ─── 3. Clone repo ───
$repoDir = "$HOME\Projects\Claude-playground"
$repoUrl = "https://github.com/CheersData/Claude-playground.git"
$branch = "claude/resume-data-loading-fh1xc"

if (-not (Test-Path $repoDir)) {
    Write-Host ">>> Clono repository..." -ForegroundColor Yellow
    New-Item -Path "$HOME\Projects" -ItemType Directory -Force | Out-Null
    git clone $repoUrl $repoDir
} else {
    Write-Host ">>> Repository gia presente in $repoDir" -ForegroundColor Green
}

Set-Location $repoDir
Write-Host ">>> Checkout branch $branch..." -ForegroundColor Yellow
git fetch origin $branch
git checkout $branch
git pull origin $branch

# ─── 4. Installa dipendenze ───
Set-Location "$repoDir\controlla-me"
Write-Host ">>> Installo dipendenze npm..." -ForegroundColor Yellow
npm install

# ─── 5. Crea .env.local ───
$envFile = "$repoDir\controlla-me\.env.local"
if (-not (Test-Path $envFile)) {
    Write-Host ""
    Write-Host ">>> Configuro variabili d'ambiente (.env.local)" -ForegroundColor Yellow
    Write-Host ">>> Trovi le chiavi nel dashboard Supabase: Settings > API" -ForegroundColor Gray
    Write-Host ""

    $supaUrl   = Read-Host "NEXT_PUBLIC_SUPABASE_URL"
    $supaAnon  = Read-Host "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    $supaSecret = Read-Host "SUPABASE_SERVICE_ROLE_KEY" # -AsSecureString non funziona per il file
    $voyageKey = Read-Host "VOYAGE_API_KEY (opzionale, premi Invio per saltare)"

    @"
NEXT_PUBLIC_SUPABASE_URL=$supaUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$supaAnon
SUPABASE_SERVICE_ROLE_KEY=$supaSecret
VOYAGE_API_KEY=$voyageKey
"@ | Set-Content -Path $envFile -Encoding UTF8

    Write-Host ">>> .env.local creato" -ForegroundColor Green
} else {
    Write-Host ">>> .env.local gia presente" -ForegroundColor Green
}

# ─── 6. Seed corpus ───
Write-Host ""
Write-Host ">>> Carico corpus giuridico nel DB (~5-10 minuti)..." -ForegroundColor Yellow
Write-Host ">>> Normattiva: via Akoma Ntoso XML API" -ForegroundColor Gray
Write-Host ">>> EUR-Lex: via HTML parser" -ForegroundColor Gray
Write-Host ""
npx tsx scripts/seed-corpus.ts --force all

# ─── 7. Verifica dati ───
Write-Host ""
Write-Host ">>> Verifico qualita dati..." -ForegroundColor Yellow
npx tsx scripts/check-data.ts

# ─── 8. Done! ───
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETATO!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Per avviare il server di sviluppo:" -ForegroundColor White
Write-Host "    cd $repoDir\controlla-me" -ForegroundColor Cyan
Write-Host "    npm run dev" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Apri: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "  Altri comandi utili:" -ForegroundColor White
Write-Host "    npm run build      # Build di produzione" -ForegroundColor Gray
Write-Host "    npm run test       # Esegui test" -ForegroundColor Gray
Write-Host "    npm run lint       # Linting" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
