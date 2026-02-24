#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Setup COMPLETO per controlla.me su un PC Windows vergine.

.DESCRIPTION
    Installa tutto il necessario partendo da zero (serve solo Git gia installato):
    1. fnm + Node.js 22
    2. Python 3.12 (per script e automazioni future)
    3. VS Code + estensioni raccomandate
    4. Supabase CLI
    5. Clone del repository
    6. npm install
    7. Configurazione .env.local
    8. Verifica build
    9. Caricamento corpus legislativo (opzionale)
   10. Shortcut desktop

.USAGE
    Apri PowerShell come Amministratore e lancia:
    Set-ExecutionPolicy Bypass -Scope Process -Force; irm https://raw.githubusercontent.com/CheersData/Claude-playground/master/controlla-me/scripts/setup-new-pc.ps1 | iex

    Oppure da locale:
    Set-ExecutionPolicy Bypass -Scope Process -Force; .\controlla-me\scripts\setup-new-pc.ps1
#>

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"   # velocizza Invoke-WebRequest

# ─── Configurazione ───

$REPO_URL     = "https://github.com/CheersData/Claude-playground.git"
$REPO_DIR     = "$env:USERPROFILE\Claude-playground"
$PROJECT_DIR  = "$REPO_DIR\controlla-me"
$NODE_VERSION = "22"

$VSCODE_EXTENSIONS = @(
    "dbaeumer.vscode-eslint"
    "esbenp.prettier-vscode"
    "bradlc.vscode-tailwindcss"
    "ms-python.python"
    "Prisma.prisma"
    "formulahendry.auto-rename-tag"
    "christian-kohler.path-intellisense"
    "usernamehw.errorlens"
    "eamodio.gitlens"
    "ms-vscode.vscode-typescript-next"
)

# ─── Helper functions ───

function Write-Banner {
    Clear-Host
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host "                                                                  " -ForegroundColor Cyan
    Write-Host "     controlla.me - Setup Completo PC Nuovo                       " -ForegroundColor White
    Write-Host "                                                                  " -ForegroundColor Cyan
    Write-Host "     Installa TUTTO il necessario per sviluppare e far girare     " -ForegroundColor Gray
    Write-Host "     controlla.me su un computer Windows appena formattato.       " -ForegroundColor Gray
    Write-Host "                                                                  " -ForegroundColor Cyan
    Write-Host "     Prerequisito: Git installato                                 " -ForegroundColor Yellow
    Write-Host "                                                                  " -ForegroundColor Cyan
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Step, [string]$Total, [string]$Message)
    Write-Host ""
    Write-Host "  [$Step/$Total] " -ForegroundColor Cyan -NoNewline
    Write-Host $Message -ForegroundColor White
    Write-Host "  $("-" * 56)" -ForegroundColor DarkGray
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    [OK] $Message" -ForegroundColor Green
}

function Write-Skip {
    param([string]$Message)
    Write-Host "    [--] $Message" -ForegroundColor DarkGray
}

function Write-Warn {
    param([string]$Message)
    Write-Host "    [!]  $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "    [X]  $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "         $Message" -ForegroundColor Gray
}

function Test-Cmd {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Install-WithWinget {
    param(
        [string]$PackageId,
        [string]$DisplayName,
        [string]$TestCommand
    )

    if ($TestCommand -and (Test-Cmd $TestCommand)) {
        Write-Skip "$DisplayName gia installato"
        return $true
    }

    Write-Info "Installazione $DisplayName tramite winget..."
    try {
        winget install --id $PackageId -e --accept-source-agreements --accept-package-agreements --silent
        return $true
    }
    catch {
        Write-Err "Installazione $DisplayName fallita: $_"
        return $false
    }
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath    = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:PATH    = "$machinePath;$userPath"
}

# ─── Totale step ───
$TOTAL_STEPS = "10"

# ================================================================
#  START
# ================================================================

Write-Banner

# Verifica winget
if (-not (Test-Cmd "winget")) {
    Write-Err "winget non trovato! Aggiorna Windows o installa App Installer dal Microsoft Store."
    Write-Host "    https://aka.ms/getwinget" -ForegroundColor Yellow
    Read-Host "  Premi INVIO per uscire"
    exit 1
}
Write-Ok "winget disponibile"

# Verifica Git
if (-not (Test-Cmd "git")) {
    Write-Err "Git non trovato! Installalo prima: https://git-scm.com"
    Read-Host "  Premi INVIO per uscire"
    exit 1
}
Write-Ok "Git $(git --version)"

# ─── Step 1: fnm + Node.js ───

Write-Step "1" $TOTAL_STEPS "Node.js $NODE_VERSION (via fnm)"

if (-not (Test-Cmd "fnm")) {
    Install-WithWinget -PackageId "Schniz.fnm" -DisplayName "fnm" | Out-Null
    # Aggiungi fnm al PATH per questa sessione
    $env:PATH = "$env:LOCALAPPDATA\fnm;$env:APPDATA\fnm;$env:PATH"
    $env:FNM_DIR = "$env:LOCALAPPDATA\fnm"
}

# Configura fnm per PowerShell
try {
    fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
} catch {
    $env:PATH = "$env:LOCALAPPDATA\fnm;$env:PATH"
}

# Installa Node.js
if (Test-Cmd "node") {
    $v = node --version
    if ($v -match "^v$NODE_VERSION") {
        Write-Ok "Node.js $v gia installato"
    } else {
        Write-Info "Aggiorno da $v a Node.js $NODE_VERSION..."
        fnm install $NODE_VERSION
        fnm use $NODE_VERSION
        fnm default $NODE_VERSION
        Write-Ok "Node.js $(node --version) installato"
    }
} else {
    fnm install $NODE_VERSION
    fnm use $NODE_VERSION
    fnm default $NODE_VERSION
    Write-Ok "Node.js $(node --version) installato"
}

# Verifica npm
if (Test-Cmd "npm") {
    Write-Ok "npm $(npm --version)"
} else {
    Write-Err "npm non trovato. Chiudi e riapri PowerShell, poi rilancia lo script."
    exit 1
}

# ─── Step 2: Python ───

Write-Step "2" $TOTAL_STEPS "Python 3"

# Disabilita temporaneamente errori per gestire l'alias Windows Store di python
$savedEAP = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
$pyVer = $null
try { $pyVer = python --version 2>&1 | Out-String } catch {}
$ErrorActionPreference = $savedEAP

$realPython = $pyVer -and $pyVer -match "Python \d"

if ($realPython) {
    Write-Ok "$($pyVer.Trim()) gia installato"
} else {
    # Prova anche python3 (stesso trattamento per alias Windows Store)
    $ErrorActionPreference = "SilentlyContinue"
    $py3Ver = $null
    try { $py3Ver = python3 --version 2>&1 | Out-String } catch {}
    $ErrorActionPreference = $savedEAP

    if ($py3Ver -and $py3Ver -match "Python \d") {
        Write-Ok "$($py3Ver.Trim()) gia installato"
    } else {
        $installed = Install-WithWinget -PackageId "Python.Python.3.12" -DisplayName "Python 3.12"
        if ($installed) {
            Refresh-Path
            if (Test-Cmd "python") {
                Write-Ok "Python $(python --version 2>&1) installato"
            } else {
                Write-Warn "Python installato ma serve riavviare il terminale per usarlo"
            }
        } else {
            Write-Warn "Python non installato. Non e' strettamente necessario per controlla.me."
            Write-Info "Puoi installarlo dopo da: https://www.python.org/downloads/"
        }
    }
}

# ─── Step 3: VS Code ───

Write-Step "3" $TOTAL_STEPS "Visual Studio Code + estensioni"

if (Test-Cmd "code") {
    Write-Ok "VS Code gia installato"
} else {
    $installed = Install-WithWinget -PackageId "Microsoft.VisualStudioCode" -DisplayName "Visual Studio Code"
    if ($installed) {
        Refresh-Path
        # Aggiungi al PATH comune di VS Code
        $codePaths = @(
            "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin"
            "$env:ProgramFiles\Microsoft VS Code\bin"
        )
        foreach ($cp in $codePaths) {
            if (Test-Path $cp) { $env:PATH = "$cp;$env:PATH"; break }
        }
    }
}

# Installa estensioni VS Code
if (Test-Cmd "code") {
    Write-Info "Installazione estensioni consigliate..."
    foreach ($ext in $VSCODE_EXTENSIONS) {
        $extName = $ext.Split(".")[-1]
        try {
            code --install-extension $ext --force 2>&1 | Out-Null
            Write-Ok "  $extName"
        } catch {
            Write-Warn "  $extName - installazione saltata"
        }
    }
} else {
    Write-Warn "VS Code non disponibile in questa sessione. Estensioni saltate."
    Write-Info "Dopo il riavvio, lancia: code --install-extension <nome>"
}

# ─── Step 4: Supabase CLI ───

Write-Step "4" $TOTAL_STEPS "Supabase CLI (opzionale)"

if (Test-Cmd "supabase") {
    Write-Ok "Supabase CLI gia installato"
} else {
    Write-Info "Supabase CLI e' utile per gestire le migrazioni localmente."
    $installSupa = Read-Host "    Installare Supabase CLI? (S/n)"
    if ($installSupa -ne "n" -and $installSupa -ne "N") {
        try {
            npm install -g supabase 2>&1 | Out-Null
            Write-Ok "Supabase CLI installato"
        } catch {
            Write-Warn "Installazione Supabase CLI fallita. Puoi installarlo dopo con: npm i -g supabase"
        }
    } else {
        Write-Skip "Supabase CLI saltato"
    }
}

# ─── Step 5: Clone repository ───

Write-Step "5" $TOTAL_STEPS "Clone del repository"

if (Test-Path "$REPO_DIR\.git") {
    Write-Ok "Repository gia presente in $REPO_DIR"
    Write-Info "Aggiorno all'ultima versione..."
    Push-Location $REPO_DIR
    try {
        git fetch origin master
        git checkout master
        git pull origin master
        Write-Ok "Repository aggiornato"
    } catch {
        Write-Warn "Aggiornamento fallito: $($_.Exception.Message)"
        Write-Info "Procedo con la versione locale..."
    }
    Pop-Location
} else {
    Write-Info "Clono il repository..."
    Write-Info "URL: $REPO_URL"
    Write-Info "Destinazione: $REPO_DIR"
    git clone $REPO_URL $REPO_DIR
    Write-Ok "Repository clonato"
}

# Verifica
if (-not (Test-Path "$PROJECT_DIR\package.json")) {
    Write-Err "Cartella controlla-me non trovata o package.json mancante!"
    Write-Err "Verifica che il clone sia andato a buon fine."
    Read-Host "  Premi INVIO per uscire"
    exit 1
}
Write-Ok "Progetto controlla-me trovato"

# ─── Step 6: npm install ───

Write-Step "6" $TOTAL_STEPS "Installazione dipendenze npm"

Push-Location $PROJECT_DIR
Write-Info "Eseguo npm install (puo' richiedere qualche minuto)..."
npm install 2>&1 | Out-Null
Pop-Location

if (Test-Path "$PROJECT_DIR\node_modules") {
    Write-Ok "Dipendenze installate"
} else {
    Write-Err "npm install fallito!"
    exit 1
}

# ─── Step 7: Configurazione .env.local ───

Write-Step "7" $TOTAL_STEPS "Configurazione variabili d'ambiente (.env.local)"

$envFile = "$PROJECT_DIR\.env.local"
$skipEnv = $false

if (Test-Path $envFile) {
    Write-Warn "File .env.local gia esistente"
    $overwrite = Read-Host "    Vuoi sovrascriverlo? (s/N)"
    if ($overwrite -ne "s" -and $overwrite -ne "S") {
        Write-Ok "Mantengo .env.local esistente"
        $skipEnv = $true
    }
}

if (-not $skipEnv) {
    Write-Host ""
    Write-Host "    Servono le chiavi API dai vari servizi." -ForegroundColor White
    Write-Host "    Premi INVIO per lasciare vuoto e compilare dopo." -ForegroundColor Gray
    Write-Host ""

    # ── Supabase ──
    Write-Host "    --- Supabase (https://supabase.com/dashboard) ---" -ForegroundColor Cyan
    $supabaseUrl        = Read-Host "    SUPABASE URL (es. https://xxx.supabase.co)"
    $supabaseAnonKey    = Read-Host "    SUPABASE ANON KEY"
    $supabaseServiceKey = Read-Host "    SUPABASE SERVICE ROLE KEY"

    # ── Anthropic ──
    Write-Host ""
    Write-Host "    --- Anthropic (https://console.anthropic.com) ---" -ForegroundColor Cyan
    $anthropicKey = Read-Host "    ANTHROPIC API KEY (sk-ant-...)"

    # ── Voyage AI ──
    Write-Host ""
    Write-Host "    --- Voyage AI (https://dash.voyageai.com) - opzionale ---" -ForegroundColor Cyan
    $voyageKey = Read-Host "    VOYAGE API KEY (pa-...)"

    # ── Stripe ──
    Write-Host ""
    Write-Host "    --- Stripe (https://dashboard.stripe.com) - opzionale ---" -ForegroundColor Cyan
    Write-Host "    Puoi saltare Stripe se non ti serve il pagamento in dev." -ForegroundColor Gray
    $stripeSecret     = Read-Host "    STRIPE SECRET KEY (invio per saltare)"
    $stripeWebhook    = ""
    $stripePub        = ""
    $stripeProPrice   = ""
    $stripeSinglePrice = ""
    if ($stripeSecret) {
        $stripeWebhook     = Read-Host "    STRIPE WEBHOOK SECRET"
        $stripePub         = Read-Host "    STRIPE PUBLISHABLE KEY"
        $stripeProPrice    = Read-Host "    STRIPE PRO PRICE ID"
        $stripeSinglePrice = Read-Host "    STRIPE SINGLE PRICE ID"
    }

    # Scrivi file
    $envContent = @"
# ─── Supabase (Database + Auth) ───
NEXT_PUBLIC_SUPABASE_URL=$supabaseUrl
NEXT_PUBLIC_SUPABASE_ANON_KEY=$supabaseAnonKey
SUPABASE_SERVICE_ROLE_KEY=$supabaseServiceKey

# ─── Anthropic Claude API ───
ANTHROPIC_API_KEY=$anthropicKey

# ─── Stripe Payments ───
STRIPE_SECRET_KEY=$stripeSecret
STRIPE_WEBHOOK_SECRET=$stripeWebhook
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$stripePub
STRIPE_PRO_PRICE_ID=$stripeProPrice
STRIPE_SINGLE_PRICE_ID=$stripeSinglePrice

# ─── Voyage AI - embeddings per il vector DB legale ───
VOYAGE_API_KEY=$voyageKey

# ─── App Configuration ───
NEXT_PUBLIC_APP_URL=http://localhost:3000
"@

    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
    Write-Ok "File .env.local creato"

    if (-not $supabaseUrl -or -not $anthropicKey) {
        Write-Warn "Alcune chiavi sono vuote. Compilale prima di avviare:"
        Write-Info "  $envFile"
    }
}

# ─── Step 8: Verifica build ───

Write-Step "8" $TOTAL_STEPS "Verifica build e test"

Push-Location $PROJECT_DIR

Write-Info "Eseguo lint..."
$lintResult = npm run lint 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Ok "Lint passato"
} else {
    Write-Warn "Lint con warning (non bloccante)"
}

Write-Info "Eseguo test..."
$testResult = npm run test 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Ok "Test passati"
} else {
    Write-Warn "Alcuni test falliti (probabilmente servono le chiavi API in .env.local)"
}

Pop-Location

# ─── Step 9: Corpus legislativo ───

Write-Step "9" $TOTAL_STEPS "Caricamento corpus legislativo italiano (opzionale)"

Write-Info "Il corpus carica il Codice Civile e le leggi italiane nel vector DB."
Write-Info "Richiede: VOYAGE_API_KEY e SUPABASE configurati."
Write-Info "Tempo stimato: 5-10 minuti."
Write-Host ""
$loadCorpus = Read-Host "    Caricare il corpus ora? (s/N)"

if ($loadCorpus -eq "s" -or $loadCorpus -eq "S") {
    Push-Location $REPO_DIR
    Write-Info "Avvio seed-corpus.ts..."
    npx tsx controlla-me/scripts/seed-corpus.ts
    Pop-Location
    if ($LASTEXITCODE -eq 0) {
        Write-Ok "Corpus caricato!"
    } else {
        Write-Warn "Caricamento corpus fallito. Riprova dopo aver configurato le chiavi."
        Write-Info "Comando: cd $REPO_DIR && npx tsx controlla-me/scripts/seed-corpus.ts"
    }
} else {
    Write-Skip "Corpus non caricato. Puoi farlo dopo con:"
    Write-Info "cd $REPO_DIR && npx tsx controlla-me/scripts/seed-corpus.ts"
}

# ─── Step 10: Shortcut e configurazione finale ───

Write-Step "10" $TOTAL_STEPS "Configurazione finale e shortcut"

# Configura fnm nel profilo PowerShell (permanente)
$profilePath = $PROFILE.CurrentUserCurrentHost
if (-not (Test-Path $profilePath)) {
    New-Item -Path $profilePath -ItemType File -Force | Out-Null
}

$profileContent = ""
if (Test-Path $profilePath) {
    $profileContent = Get-Content $profilePath -Raw -ErrorAction SilentlyContinue
}

if (-not $profileContent -or -not $profileContent.Contains("fnm env")) {
    Add-Content -Path $profilePath -Value "`n# fnm (Node.js version manager)`nfnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression"
    Write-Ok "fnm configurato nel profilo PowerShell"
}

# Crea shortcut sul Desktop
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = "$desktopPath\Avvia controlla.me.lnk"

try {
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "$PROJECT_DIR\AVVIA_SITO.bat"
    $shortcut.WorkingDirectory = $PROJECT_DIR
    $shortcut.Description = "Avvia controlla.me in modalita sviluppo"
    $shortcut.Save()
    Write-Ok "Shortcut creato sul Desktop"
} catch {
    Write-Warn "Impossibile creare shortcut. Puoi usare direttamente:"
    Write-Info "  $PROJECT_DIR\AVVIA_SITO.bat"
}

# Crea shortcut per VS Code
if (Test-Cmd "code") {
    $codeShortcut = "$desktopPath\controlla.me (VS Code).lnk"
    try {
        $sc = $shell.CreateShortcut($codeShortcut)
        $sc.TargetPath = (Get-Command code).Source -replace "\\bin\\code$", "\Code.exe" -replace "\\bin\\code\.cmd$", "\Code.exe"
        $sc.Arguments = "`"$PROJECT_DIR`""
        $sc.WorkingDirectory = $PROJECT_DIR
        $sc.Description = "Apri controlla.me in VS Code"
        $sc.Save()
        Write-Ok "Shortcut VS Code creato sul Desktop"
    } catch {
        Write-Skip "Shortcut VS Code non creato"
    }
}

# ================================================================
#  RIEPILOGO FINALE
# ================================================================

Write-Host ""
Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Cyan
Write-Host ""

# Verifica tutto
$checks = @(
    @{ Name = "Git";            Check = { Test-Cmd "git" } },
    @{ Name = "Node.js $NODE_VERSION";     Check = { Test-Cmd "node" } },
    @{ Name = "npm";            Check = { Test-Cmd "npm" } },
    @{ Name = "Python";         Check = { (Test-Cmd "python") -or (Test-Cmd "python3") } },
    @{ Name = "VS Code";        Check = { Test-Cmd "code" } },
    @{ Name = "Repository";     Check = { Test-Path "$REPO_DIR\.git" } },
    @{ Name = "package.json";   Check = { Test-Path "$PROJECT_DIR\package.json" } },
    @{ Name = "node_modules";   Check = { Test-Path "$PROJECT_DIR\node_modules" } },
    @{ Name = ".env.local";     Check = { Test-Path "$PROJECT_DIR\.env.local" } }
)

$allOk = $true
$warnings = 0
foreach ($check in $checks) {
    $result = & $check.Check
    if ($result) {
        Write-Ok "$($check.Name)"
    } else {
        # Python e VS Code sono opzionali
        if ($check.Name -eq "Python" -or $check.Name -eq "VS Code") {
            Write-Warn "$($check.Name) - non disponibile (opzionale)"
            $warnings++
        } else {
            Write-Err "$($check.Name) - MANCANTE"
            $allOk = $false
        }
    }
}

Write-Host ""
Write-Host "  ================================================================" -ForegroundColor Cyan

if ($allOk) {
    Write-Host ""
    if ($warnings -eq 0) {
        Write-Host "     SETUP COMPLETATO CON SUCCESSO!" -ForegroundColor Green
    } else {
        Write-Host "     SETUP COMPLETATO (con $warnings warning)" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Per avviare controlla.me:" -ForegroundColor White
    Write-Host ""
    Write-Host "    Opzione 1 - Doppio click:" -ForegroundColor Gray
    Write-Host "      $desktopPath\Avvia controlla.me.lnk" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    Opzione 2 - Da terminale:" -ForegroundColor Gray
    Write-Host "      cd $PROJECT_DIR" -ForegroundColor Yellow
    Write-Host "      npm run dev" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "    Poi apri nel browser:" -ForegroundColor Gray
    Write-Host "      http://localhost:3000" -ForegroundColor Cyan
    Write-Host ""
    if (Test-Cmd "code") {
        Write-Host "  Per aprire il progetto in VS Code:" -ForegroundColor White
        Write-Host "      code $PROJECT_DIR" -ForegroundColor Yellow
        Write-Host ""
    }
    Write-Host "  ================================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  NOTA: Se hai lasciato vuote delle chiavi API in .env.local," -ForegroundColor Yellow
    Write-Host "  compilale prima di avviare il sito. Il file si trova in:" -ForegroundColor Yellow
    Write-Host "    $PROJECT_DIR\.env.local" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "     SETUP INCOMPLETO - Controlla gli errori sopra" -ForegroundColor Red
    Write-Host ""
    Write-Host "  ================================================================" -ForegroundColor Cyan
}

Write-Host ""
Read-Host "  Premi INVIO per chiudere"
